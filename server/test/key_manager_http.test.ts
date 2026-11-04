import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  KeyManagerOperatorAuthenticator,
  type OperatorTokenVerifier,
  type VerifiedOperatorIdentity,
} from "../src/operator_auth.js";
import { PemEd25519MercateLicenseSigner } from "../src/mercate_license.js";
import { MemoryMercateLicenseRegistryStore, MercateLicenseRegistryService } from "../src/mercate_registry.js";
import { createKeyManagerHttpServer } from "../src/key_manager_http.js";

const operator: VerifiedOperatorIdentity = {
  subject: "google-sub-owner",
  email: "owner@example.com",
  emailVerified: true,
  issuer: "https://accounts.google.com",
};

async function start(role: "administrator" | "read_only" = "administrator") {
  const { privateKey } = generateKeyPairSync("ed25519");
  const signer = new PemEd25519MercateLicenseSigner(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  const registry = new MercateLicenseRegistryService(new MemoryMercateLicenseRegistryStore(), signer);
  const verifier: OperatorTokenVerifier = {
    async verify(token, audience) {
      assert.equal(token, "test-id-token");
      assert.equal(audience, "key-manager-client-id");
      return operator;
    },
  };
  const authenticator = new KeyManagerOperatorAuthenticator({
    audience: "key-manager-client-id",
    allowedOperators: [{ email: "owner@example.com", roles: [role] }],
    verifier,
  });
  const server = createKeyManagerHttpServer({
    authenticator,
    registry,
    now: () => new Date("2026-11-04T12:00:00.000Z"),
  });
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

const businessId = "123e4567-e89b-12d3-a456-426614174000";
const headers = {
  authorization: "Bearer test-id-token",
  "content-type": "application/json",
  "idempotency-key": "issue-test-0001",
};

test("issue endpoint derives actor from authenticated Google identity and returns signed token", async () => {
  const { server, baseUrl } = await start();
  try {
    const response = await fetch(`${baseUrl}/v1/key-manager/licenses/issue`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        businessId,
        term: { kind: "monthly", timeZone: "Africa/Nairobi" },
        graceDays: 3,
        maxDevices: 2,
        actorId: "attacker-controlled-actor",
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.license.claims.businessId, businessId);
    assert.equal(body.license.claims.graceDays, 3);
    assert.equal(body.license.claims.maxDevices, 2);
    assert.match(body.activationToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(body.license.actorId, undefined);
  } finally {
    server.close();
  }
});

test("unauthenticated write is rejected", async () => {
  const { server, baseUrl } = await start();
  try {
    const response = await fetch(`${baseUrl}/v1/key-manager/licenses/issue`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "unauthenticated" },
      body: JSON.stringify({ businessId, term: { kind: "weekly" } }),
    });
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test("read-only operator cannot issue a licence", async () => {
  const { server, baseUrl } = await start("read_only");
  try {
    const response = await fetch(`${baseUrl}/v1/key-manager/licenses/issue`, {
      method: "POST",
      headers,
      body: JSON.stringify({ businessId, term: { kind: "weekly" } }),
    });
    assert.equal(response.status, 403);
  } finally {
    server.close();
  }
});

test("history endpoint requires authentication and read permission", async () => {
  const { server, baseUrl } = await start("read_only");
  try {
    const response = await fetch(`${baseUrl}/v1/key-manager/businesses/${businessId}/history`, {
      headers: { authorization: "Bearer test-id-token" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.licenses, []);
    assert.deepEqual(body.auditEvents, []);
  } finally {
    server.close();
  }
});

test("invalid business ID is rejected before reaching registry", async () => {
  const { server, baseUrl } = await start();
  try {
    const response = await fetch(`${baseUrl}/v1/key-manager/licenses/issue`, {
      method: "POST",
      headers,
      body: JSON.stringify({ businessId: "not-a-uuid", term: { kind: "weekly" } }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_business_id" });
  } finally {
    server.close();
  }
});
