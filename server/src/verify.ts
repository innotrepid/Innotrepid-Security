import { randomUUID } from "node:crypto";
import type { VerificationRequest, VerificationResponse } from "./domain.js";
import { canGrant, validateApp } from "./registry.js";

export function verifyRequest(request: VerificationRequest): VerificationResponse {
  const verificationId = randomUUID();
  const definition = validateApp(request.app);

  if (!definition) {
    return {
      status: "denied",
      reason: "unknown_application",
      verificationId,
    };
  }

  // Provider verification is intentionally not bypassed here.
  // Until purchase/integrity providers are connected, a request with
  // evidence cannot be treated as proof of premium ownership.
  if (!request.purchaseToken && !request.integrityToken) {
    return {
      status: "unavailable",
      reason: "verification_evidence_required",
      verificationId,
    };
  }

  return {
    status: "unavailable",
    reason: "provider_verification_not_configured",
    verificationId,
  };
}

export { canGrant };
