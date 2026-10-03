import test from "node:test";
import assert from "node:assert/strict";
import { MemoryEntitlementStore } from "../src/store.js";
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
    return { valid: true, packageName: "com.innotrepid.resonate" };
  },
};

test("verified evidence creates an entitlement", async () => {
  const store = new MemoryEntitlementStore();

  const result = await verify({
    requestId: "request-1",
    app: {
      appId: "resonate",
      packageName: "com.innotrepid.resonate",
      version: "1.0.0",
    },
    purchaseToken: "purchase-token",
    integrityToken: "integrity-token",
  }, {
    purchaseProvider,
    integrityProvider,
    store,
  });

  assert.equal(result.status, "verified");
  assert.equal(result.entitlement?.id, "premium");
  assert.ok(store.get("resonate", "user-1", "premium"));
});
