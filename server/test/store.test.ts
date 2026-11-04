import test from "node:test";
import assert from "node:assert/strict";
import { hashPurchaseToken } from "../src/crypto.js";
import { resolveEntitlement } from "../src/entitlements.js";
import { MemoryEntitlementStore } from "../src/store.js";

test("stores and resolves an active entitlement", () => {
  const store = new MemoryEntitlementStore();

  store.put({
    appId: "resonate",
    subjectId: "user-1",
    id: "premium",
    status: "active",
    policyVersion: 1,
    updatedAt: new Date().toISOString(),
  });

  assert.equal(
    resolveEntitlement(store, "resonate", "user-1", "premium")?.status,
    "active",
  );
});

test("expired entitlement resolves as expired", () => {
  const store = new MemoryEntitlementStore();

  store.put({
    appId: "resonate",
    subjectId: "user-1",
    id: "premium",
    status: "active",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    policyVersion: 1,
    updatedAt: new Date().toISOString(),
  });

  assert.equal(
    resolveEntitlement(store, "resonate", "user-1", "premium")?.status,
    "expired",
  );
});

test("purchase tokens are stored as hashes, not raw values", () => {
  const hash = hashPurchaseToken("example-token");
  assert.equal(hash.length, 64);
  assert.notEqual(hash, "example-token");
});
