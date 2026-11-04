import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  MemoryMercateLicenseRegistryStore,
  MercateLicenseRegistryService,
} from "../src/mercate_registry.js";
import { PemEd25519MercateLicenseSigner } from "../src/mercate_license.js";

function setup() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signer = new PemEd25519MercateLicenseSigner(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  const store = new MemoryMercateLicenseRegistryStore();
  const service = new MercateLicenseRegistryService(store, signer);
  return { store, service, publicKey };
}

const at = (value: string) => new Date(value);
const base = {
  businessId: "business-1",
  actorId: "operator-1",
  now: at("2026-11-04T09:15:00.000Z"),
};

test("initial issue creates one current licence and an audit event", async () => {
  const { store, service, publicKey } = setup();
  const result = await service.issue({
    ...base, idempotencyKey: "issue-1", term: { kind: "weekly" },
    graceDays: 2, maxDevices: 3,
  });
  assert.equal(result.action, "issued");
  assert.equal(result.record.status, "current");
  assert.equal(result.record.claims.maxDevices, 3);
  assert.equal(store.listHistory("business-1").length, 1);
  assert.equal(store.listAuditEvents("business-1").length, 1);
  const [payload, signature] = result.record.token.split(".");
  assert.equal(verify(
    null, Buffer.from(payload, "base64url"), publicKey,
    Buffer.from(signature, "base64url"),
  ), true);
});

test("second initial issue for a business is rejected", async () => {
  const { service } = setup();
  await service.issue({ ...base, idempotencyKey: "issue-1", term: { kind: "weekly" } });
  await assert.rejects(
    service.issue({ ...base, idempotencyKey: "issue-2", term: { kind: "monthly" } }),
    /business_already_has_current_license/,
  );
});

test("renewal extends from the later of now or current expiry and supersedes old licence", async () => {
  const { store, service } = setup();
  const first = await service.issue({
    ...base, idempotencyKey: "issue-1", term: { kind: "weekly" },
    graceDays: 4, maxDevices: 2,
  });
  const renewed = await service.renew({
    ...base, idempotencyKey: "renew-1", term: { kind: "weekly" },
    now: at("2026-11-08T09:15:00.000Z"),
  });
  assert.equal(renewed.record.claims.expiresAt, "2026-11-18T09:15:00.000Z");
  assert.equal(renewed.record.claims.graceDays, 4);
  assert.equal(renewed.record.claims.maxDevices, 2);
  assert.equal(renewed.record.status, "current");
  assert.equal(store.listHistory("business-1").find(
    (item) => item.licenseId === first.record.licenseId,
  )?.status, "superseded");
  assert.equal(store.listAuditEvents("business-1").length, 2);
});

test("renewal of an expired licence starts a fresh term from now", async () => {
  const { service } = setup();
  await service.issue({
    ...base, idempotencyKey: "issue-1", term: { kind: "weekly" },
  });
  const renewed = await service.renew({
    ...base, idempotencyKey: "renew-1", term: { kind: "weekly" },
    now: at("2026-11-20T09:15:00.000Z"),
  });
  assert.equal(renewed.record.claims.expiresAt, "2026-11-27T09:15:00.000Z");
});

test("replacement preserves expiry and policy unless overridden", async () => {
  const { store, service } = setup();
  const first = await service.issue({
    ...base, idempotencyKey: "issue-1", term: { kind: "monthly" },
    graceDays: 5, maxDevices: 4,
  });
  const replacement = await service.replace({
    ...base, idempotencyKey: "replace-1", reason: "Customer lost activation code",
  });
  assert.equal(replacement.record.claims.expiresAt, first.record.claims.expiresAt);
  assert.equal(replacement.record.claims.graceDays, 5);
  assert.equal(replacement.record.claims.maxDevices, 4);
  assert.equal(store.listHistory("business-1").length, 2);
  assert.equal(store.listHistory("business-1").find(
    (item) => item.licenseId === first.record.licenseId,
  )?.replacedByLicenseId, replacement.record.licenseId);
});

test("revoke leaves no current licence and preserves the record", async () => {
  const { store, service } = setup();
  const first = await service.issue({
    ...base, idempotencyKey: "issue-1", term: { kind: "weekly" },
  });
  const revoked = await service.revoke({
    ...base, idempotencyKey: "revoke-1", reason: "Payment reversed",
  });
  assert.equal(revoked.record.status, "revoked");
  assert.equal(revoked.record.revokedBy, "operator-1");
  assert.equal(store.listHistory("business-1").length, 1);
  assert.equal(store.listAuditEvents("business-1").length, 2);
  await assert.rejects(
    service.renew({ ...base, idempotencyKey: "renew-1", term: { kind: "weekly" } }),
    /current_license_not_found/,
  );
  assert.equal(first.record.status, "current");
});

test("idempotent replay returns the original issue without creating another record", async () => {
  const { store, service } = setup();
  const command = {
    ...base, idempotencyKey: "issue-retry", term: { kind: "weekly" as const },
  };
  const first = await service.issue(command);
  const retry = await service.issue(command);
  assert.equal(retry.idempotentReplay, true);
  assert.equal(retry.record.licenseId, first.record.licenseId);
  assert.equal(store.listHistory("business-1").length, 1);
  assert.equal(store.listAuditEvents("business-1").length, 1);
});

test("concurrent initial issues cannot create two current licences", async () => {
  const { store, service } = setup();
  const results = await Promise.allSettled([
    service.issue({ ...base, idempotencyKey: "concurrent-a", term: { kind: "weekly" } }),
    service.issue({ ...base, idempotencyKey: "concurrent-b", term: { kind: "weekly" } }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(store.listHistory("business-1").filter(
    (record) => record.status === "current",
  ).length, 1);
});
