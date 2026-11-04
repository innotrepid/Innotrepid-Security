import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import {
  MercateLicenseRegistryService,
} from "../src/mercate_registry.js";
import { PemEd25519MercateLicenseSigner } from "../src/mercate_license.js";
import { PostgresMercateLicenseRegistryStore } from "../src/mercate_postgres_store.js";
import { adaptNodePostgresPool } from "../src/node_postgres_adapter.js";

const databaseUrl = process.env.DATABASE_URL;
const schema = `mercate_it_${randomUUID().replaceAll("-", "")}`;
let adminPool: Pool | undefined;
let testPool: Pool | undefined;

before(async () => {
  if (!databaseUrl) return;
  adminPool = new Pool({ connectionString: databaseUrl });
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  testPool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`,
    max: 8,
  });
  const migration = await readFile(
    new URL("../migrations/001_mercate_license_registry.sql", import.meta.url),
    "utf8",
  );
  await testPool.query(migration);
});

after(async () => {
  await testPool?.end();
  if (adminPool) {
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  }
});

test("live PostgreSQL registry serializes issuance and persists idempotency/audit", {
  skip: !databaseUrl,
}, async () => {
  assert.ok(testPool, "test PostgreSQL pool must be initialized");
  const { privateKey } = generateKeyPairSync("ed25519");
  const signer = new PemEd25519MercateLicenseSigner(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  const store = new PostgresMercateLicenseRegistryStore(adaptNodePostgresPool(testPool));
  const service = new MercateLicenseRegistryService(store, signer);
  const now = new Date("2026-11-04T09:15:00.000Z");

  const attempts = await Promise.allSettled([
    service.issue({
      businessId: "concurrent-business",
      actorId: "integration-operator",
      idempotencyKey: "concurrent-a",
      term: { kind: "weekly" },
      graceDays: 2,
      maxDevices: 3,
      now,
    }),
    service.issue({
      businessId: "concurrent-business",
      actorId: "integration-operator",
      idempotencyKey: "concurrent-b",
      term: { kind: "weekly" },
      graceDays: 2,
      maxDevices: 3,
      now,
    }),
  ]);

  const successes = attempts.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.issue>>> =>
      result.status === "fulfilled",
  );
  const failures = attempts.filter((result) => result.status === "rejected");
  assert.equal(successes.length, 1, "exactly one concurrent issue must succeed");
  assert.equal(failures.length, 1, "the competing issue must be rejected");

  const issued = successes[0].value;
  assert.equal(issued.record.status, "current");
  assert.equal(issued.record.claims.graceDays, 2);
  assert.equal(issued.record.claims.maxDevices, 3);

  // A fresh service/store instance proves the retry result is database-backed.
  const retryService = new MercateLicenseRegistryService(
    new PostgresMercateLicenseRegistryStore(adaptNodePostgresPool(testPool)),
    signer,
  );
  const replay = await retryService.issue({
    businessId: "concurrent-business",
    actorId: "integration-operator",
    idempotencyKey: issued.action === "issued"
      ? (attempts[0].status === "fulfilled" ? "concurrent-a" : "concurrent-b")
      : "unused",
    term: { kind: "weekly" },
    graceDays: 2,
    maxDevices: 3,
    now,
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.record.licenseId, issued.record.licenseId);

  const history = await retryService.listHistory("concurrent-business");
  assert.equal(history.licenses.length, 1);
  assert.equal(history.licenses[0].status, "current");
  assert.equal(history.auditEvents.length, 1);
  assert.equal(history.auditEvents[0].actorId, "integration-operator");

  await assert.rejects(
    retryService.issue({
      businessId: "concurrent-business",
      actorId: "integration-operator",
      idempotencyKey: "new-issue-after-success",
      term: { kind: "monthly" },
      now,
    }),
    /business_already_has_current_license/,
  );

  const persisted = await retryService.listHistory("concurrent-business");
  assert.equal(persisted.licenses.length, 1, "failed issue must not leave a partial record");
  assert.equal(persisted.auditEvents.length, 1, "failed issue must not leave an audit row");
});
