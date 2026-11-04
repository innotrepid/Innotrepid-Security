import assert from "node:assert/strict";
import test from "node:test";
import {
  hasKeyManagerPermission,
  KeyManagerOperatorAuthenticator,
  OperatorAuthenticationError,
  type OperatorTokenVerifier,
  type VerifiedOperatorIdentity,
} from "../src/operator_auth.js";

const identity: VerifiedOperatorIdentity = {
  subject: "google-sub-123",
  email: "owner@example.com",
  emailVerified: true,
  issuer: "https://accounts.google.com",
};

function authenticator(
  verified: VerifiedOperatorIdentity = identity,
  allowed = [{ email: "owner@example.com", roles: ["administrator"] as const }],
) {
  const verifier: OperatorTokenVerifier = {
    async verify(token, audience) {
      assert.equal(token, "valid-id-token");
      assert.equal(audience, "key-manager-client-id");
      return verified;
    },
  };
  return new KeyManagerOperatorAuthenticator({
    audience: "key-manager-client-id",
    allowedOperators: allowed,
    verifier,
  });
}

test("verified allowlisted Google operator receives stable actor ID and administrator permissions", async () => {
  const principal = await authenticator().authenticate("Bearer valid-id-token");
  assert.equal(principal.actorId, "google:google-sub-123");
  assert.equal(principal.email, "owner@example.com");
  assert.ok(hasKeyManagerPermission(principal, "mercate:licenses:write"));
  assert.ok(hasKeyManagerPermission(principal, "mercate:operators:manage"));
});

test("email matching is case-insensitive and read-only role cannot write", async () => {
  const auth = authenticator(identity, [
    { email: "OWNER@EXAMPLE.COM", roles: ["read_only"] },
  ]);
  const principal = await auth.authenticate("Bearer valid-id-token");
  assert.ok(hasKeyManagerPermission(principal, "mercate:licenses:read"));
  assert.equal(hasKeyManagerPermission(principal, "mercate:licenses:write"), false);
});

test("missing bearer token is rejected", async () => {
  await assert.rejects(
    authenticator().authenticate(undefined),
    (error: unknown) => error instanceof OperatorAuthenticationError &&
      error.code === "missing_bearer_token",
  );
});

test("unverified Google email is rejected", async () => {
  await assert.rejects(
    authenticator({ ...identity, emailVerified: false }).authenticate("Bearer valid-id-token"),
    (error: unknown) => error instanceof OperatorAuthenticationError &&
      error.code === "invalid_bearer_token",
  );
});

test("non-Google issuer is rejected", async () => {
  await assert.rejects(
    authenticator({ ...identity, issuer: "https://attacker.example" }).authenticate("Bearer valid-id-token"),
    (error: unknown) => error instanceof OperatorAuthenticationError &&
      error.code === "invalid_bearer_token",
  );
});

test("authenticated but unallowlisted Google account is rejected", async () => {
  await assert.rejects(
    authenticator(identity, []).authenticate("Bearer valid-id-token"),
    (error: unknown) => error instanceof OperatorAuthenticationError &&
      error.code === "operator_not_allowed",
  );
});

test("invalid tokens are rejected without exposing verifier errors", async () => {
  const verifier: OperatorTokenVerifier = {
    async verify() { throw new Error("sensitive verifier detail"); },
  };
  const auth = new KeyManagerOperatorAuthenticator({
    audience: "key-manager-client-id",
    allowedOperators: [{ email: "owner@example.com", roles: ["administrator"] }],
    verifier,
  });
  await assert.rejects(
    auth.authenticate("Bearer invalid"),
    (error: unknown) => error instanceof OperatorAuthenticationError &&
      error.code === "invalid_bearer_token" &&
      !error.message.includes("sensitive"),
  );
});

test("invalid and duplicate allowlist entries fail closed", () => {
  assert.throws(() => new KeyManagerOperatorAuthenticator({
    audience: "client",
    allowedOperators: [{ email: "owner@example.com", roles: ["unknown" as never] }],
    verifier: { async verify() { return identity; } },
  }));
  assert.throws(() => new KeyManagerOperatorAuthenticator({
    audience: "client",
    allowedOperators: [
      { email: "owner@example.com", roles: ["administrator"] },
      { email: "OWNER@example.com", roles: ["read_only"] },
    ],
    verifier: { async verify() { return identity; } },
  }));
});
