import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  calculateMercateExpiry,
  issueMercateLicense,
  PemEd25519MercateLicenseSigner,
} from "../src/mercate_license.js";

const at = (value: string) => new Date(value);

test("weekly term is exactly seven elapsed days", () => {
  const issued = at("2026-11-04T09:15:00.000Z");
  assert.equal(
    calculateMercateExpiry(issued, { kind: "weekly" }).toISOString(),
    "2026-11-11T09:15:00.000Z",
  );
});

test("monthly term clamps January 31 to February 28 in a common year", () => {
  assert.equal(
    calculateMercateExpiry(at("2025-01-31T09:15:00.000Z"), { kind: "monthly" }).toISOString(),
    "2025-02-28T09:15:00.000Z",
  );
});

test("monthly term clamps January 31 to February 29 in a leap year", () => {
  assert.equal(
    calculateMercateExpiry(at("2024-01-31T09:15:00.000Z"), { kind: "monthly" }).toISOString(),
    "2024-02-29T09:15:00.000Z",
  );
});

test("monthly term preserves local wall time in an IANA billing zone", () => {
  assert.equal(
    calculateMercateExpiry(at("2026-01-31T06:15:00.000Z"), {
      kind: "monthly", timeZone: "Africa/Nairobi",
    }).toISOString(),
    "2026-02-28T06:15:00.000Z",
  );
});

test("custom expiry requires an explicit offset and must follow issue time", () => {
  const issued = at("2026-11-04T09:15:00.000Z");
  assert.equal(
    calculateMercateExpiry(issued, {
      kind: "custom", expiresAt: "2026-12-04T12:00:00+03:00",
    }).toISOString(),
    "2026-12-04T09:00:00.000Z",
  );
  assert.throws(() => calculateMercateExpiry(issued, {
    kind: "custom", expiresAt: "2026-12-04T12:00:00",
  }), /explicit UTC offset/);
  assert.throws(() => calculateMercateExpiry(issued, {
    kind: "custom", expiresAt: "2026-11-04T09:00:00Z",
  }), /later than issuedAt/);
});

test("issued token matches Mercate v1 two-part Ed25519 contract", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signer = new PemEd25519MercateLicenseSigner(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  const result = await issueMercateLicense({
    businessId: "business-uuid",
    licenseId: "license-123",
    issuedAt: at("2026-11-04T09:15:00.000Z"),
    term: { kind: "monthly", timeZone: "Africa/Nairobi" },
    graceDays: 3,
    maxDevices: 2,
  }, signer);

  const parts = result.token.split(".");
  assert.equal(parts.length, 2);
  const payload = Buffer.from(parts[0], "base64url");
  const signature = Buffer.from(parts[1], "base64url");
  assert.equal(signature.length, 64);
  assert.equal(verify(null, payload, publicKey, signature), true);
  assert.deepEqual(JSON.parse(payload.toString("utf8")), result.claims);
  assert.equal(result.claims.product, "mercate");
  assert.equal(result.claims.schemaVersion, 1);
  assert.equal(result.claims.graceDays, 3);
  assert.equal(result.claims.maxDevices, 2);
});

test("invalid policy values are rejected before asynchronous signing", async () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const signer = new PemEd25519MercateLicenseSigner(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  await assert.rejects(issueMercateLicense({
    businessId: "business-uuid",
    term: { kind: "weekly" },
    graceDays: -1,
  }, signer), /graceDays/);
  await assert.rejects(issueMercateLicense({
    businessId: "business-uuid",
    term: { kind: "weekly" },
    maxDevices: 0,
  }, signer), /maxDevices/);
});
