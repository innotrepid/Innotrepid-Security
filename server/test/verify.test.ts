import test from "node:test";
import assert from "node:assert/strict";
import { verifyRequest } from "../src/verify.js";

test("rejects unknown application", () => {
  const result = verifyRequest({
    requestId: "test",
    app: {
      appId: "unknown",
      packageName: "unknown",
      version: "1.0.0"
    }
  });

  assert.equal(result.status, "denied");
  assert.equal(result.reason, "unknown_application");
});

test("does not grant premium from client state alone", () => {
  const result = verifyRequest({
    requestId: "test",
    app: {
      appId: "resonate",
      packageName: "com.innotrepid.resonate",
      version: "1.0.0"
    }
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "verification_evidence_required");
});

test("does not pretend provider verification exists", () => {
  const result = verifyRequest({
    requestId: "test",
    app: {
      appId: "resonate",
      packageName: "com.innotrepid.resonate",
      version: "1.0.0"
    },
    purchaseToken: "example-token"
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "provider_verification_not_configured");
});
