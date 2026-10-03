import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createSecurityHttpServer } from "../src/http.js";
import { MemoryEntitlementStore } from "../src/store.js";
import type { IntegrityProvider, PurchaseProvider } from "../src/providers.js";

const purchaseProvider: PurchaseProvider = {
  async verify() {
    return { valid: true, subjectId: "user-1", productId: "premium" };
  },
};

const integrityProvider: IntegrityProvider = {
  async verify() {
    return { valid: true, packageName: "com.innotrepid.resonate", subjectId: "user-1" };
  },
};

async function startServer() {
  const server = createSecurityHttpServer({
    verification: {
      purchaseProvider,
      integrityProvider,
      store: new MemoryEntitlementStore(),
    },
  });
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("health endpoint responds", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    server.close();
  }
});

test("verify endpoint returns a validated entitlement", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/v1/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "request-1",
        app: { appId: "resonate", packageName: "com.innotrepid.resonate", version: "1.0.0" },
        purchaseToken: "purchase-token",
        integrityToken: "integrity-token",
        integrityRequestHash: "request-hash",
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "verified");
    assert.equal(body.entitlement.id, "premium");
    assert.ok(body.verificationId);
    assert.ok(body.entitlement.purchaseTokenHash);
    assert.equal(body.entitlement.purchaseTokenHash.includes("purchase-token"), false);
  } finally {
    server.close();
  }
});

test("invalid request is rejected", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/v1/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: {} }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "denied", reason: "invalid_request" });
  } finally {
    server.close();
  }
});
