import { randomUUID } from "node:crypto";
import type { VerificationRequest, VerificationResponse } from "./domain.js";
import type { EntitlementStore } from "./store.js";
import type { IntegrityProvider, PurchaseProvider } from "./providers.js";
import { canGrant, validateApp } from "./registry.js";
import { hashPurchaseToken } from "./crypto.js";

export interface VerificationServiceOptions {
  purchaseProvider: PurchaseProvider;
  integrityProvider: IntegrityProvider;
  store: EntitlementStore;
}

export async function verify(
  request: VerificationRequest,
  options: VerificationServiceOptions,
): Promise<VerificationResponse> {
  const verificationId = randomUUID();
  const definition = validateApp(request.app);

  if (!definition) {
    return { status: "denied", reason: "unknown_application", verificationId };
  }

  if (!request.purchaseToken) {
    return { status: "unavailable", reason: "purchase_evidence_required", verificationId };
  }

  const purchase = await options.purchaseProvider.verify({
    app: request.app,
    purchaseToken: request.purchaseToken,
  });

  if (!purchase.valid || !purchase.subjectId || !purchase.productId) {
    return { status: "unavailable", reason: "purchase_not_verified", verificationId };
  }

  if (!canGrant(definition, purchase.productId)) {
    return { status: "denied", reason: "product_not_entitled", verificationId };
  }

  if (!request.integrityToken) {
    return { status: "unavailable", reason: "integrity_evidence_required", verificationId };
  }

  const integrity = await options.integrityProvider.verify({
    app: request.app,
    integrityToken: request.integrityToken,
  });

  if (!integrity.valid) {
    return { status: "denied", reason: integrity.reason ?? "integrity_failed", verificationId };
  }

  if (integrity.appId && integrity.appId !== request.app.appId) {
    return { status: "denied", reason: "application_mismatch", verificationId };
  }

  if (integrity.packageName && integrity.packageName !== request.app.packageName) {
    return { status: "denied", reason: "package_mismatch", verificationId };
  }

  if (integrity.subjectId && integrity.subjectId !== purchase.subjectId) {
    return { status: "denied", reason: "subject_mismatch", verificationId };
  }

  const entitlement = {
    appId: request.app.appId,
    subjectId: purchase.subjectId,
    id: purchase.productId,
    status: "active" as const,
    expiresAt: purchase.expiresAt,
    policyVersion: 1,
    productId: purchase.productId,
    purchaseTokenHash: hashPurchaseToken(request.purchaseToken),
    updatedAt: new Date().toISOString(),
  };

  options.store.put(entitlement);

  return {
    status: "verified",
    verificationId,
    entitlement,
  };
}
