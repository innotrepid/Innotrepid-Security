import test from "node:test";
import assert from "node:assert/strict";
import { MemoryEntitlementStore } from "../src/store.js";
import { buildIntegrityRequestHash } from "../src/crypto.js";
import { verify } from "../src/service.js";
import type { PurchaseProvider, IntegrityProvider } from "../src/providers.js";

const purchaseProvider: PurchaseProvider = {
  async verify() {
    return {
      valid: true,
      subjectId: "user-1",
      productId: "resonate_premium",
    };
  },
};

const integrityProvider: IntegrityProvider = {
  async verify() {
    return { valid: true, packageName: "com.Aetherion.Resonate" };
  },
};

test("verified evidence creates an entitlement", async () => {
  const store = new MemoryEntitlementStore();
  const app = {
    appId: "resonate",
    packageName: "com.Aetherion.Resonate",
    version: "1.0.0",
  };
  const purchaseToken = "purchase-token";
  const integrityRequestHash = buildIntegrityRequestHash({
    requestId: "request-1",
    appId: app.appId,
    packageName: app.packageName,
    version: app.version,
    purchaseToken,
  });

  const result = await verify({
    requestId: "request-1",
    app,
    purchaseToken,
    integrityToken: "integrity-token",
    integrityRequestHash,
  }, {
    purchaseProvider,
    integrityProvider,
    store,
  });

  assert.equal(result.status, "verified");
  assert.equal(result.entitlement?.id, "premium");
  assert.ok(store.get("resonate", "user-1", "premium"));
});

test("rejects a tampered integrity request hash", async () => {
  const result = await verify({
    requestId: "request-2",
    app: {
      appId: "resonate",
      packageName: "com.Aetherion.Resonate",
      version: "1.0.0",
    },
    purchaseToken: "purchase-token",
    integrityToken: "integrity-token",
    integrityRequestHash: "tampered",
  }, {
    purchaseProvider,
    integrityProvider,
    store: new MemoryEntitlementStore(),
  });

  assert.equal(result.status, "denied");
  assert.equal(result.reason, "integrity_request_hash_mismatch");
});
