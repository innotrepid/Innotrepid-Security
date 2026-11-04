import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { Ed25519EntitlementTokenSigner } from "../src/token.js";

test("Ed25519 entitlement token can be signed and has short cache lifetime", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  const signer = new Ed25519EntitlementTokenSigner({
    privateKeyPem,
    keyId: "test-key-1",
    cacheTtlSeconds: 900,
  });

  const token = signer.sign({
    appId: "resonate",
    subjectId: "user-1",
    productId: "resonate_premium",
    verificationId: "verification-1",
    entitlement: {
      id: "premium",
      status: "active",
      policyVersion: 1,
    },
  });

  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.equal(payload.appId, "resonate");
  assert.equal(payload.entitlementId, "premium");
  assert.equal(payload.kid, "test-key-1");
  assert.ok(payload.exp > payload.iat);
  assert.ok(payload.cacheUntil <= payload.exp);

  // Keep the public key referenced in the test so the generated keypair is
  // exercised without ever persisting a private key.
  assert.equal(createPublicKey(publicKeyPem).asymmetricKeyType, "ed25519");
});
