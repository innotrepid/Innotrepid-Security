import { randomUUID } from "node:crypto";
import type { VerificationRequest, VerificationResponse } from "./domain.js";
import type { EntitlementStore } from "./store.js";
import type { IntegrityProvider, PurchaseProvider } from "./providers.js";
import { canGrant, findProduct, validateApp } from "./registry.js";
import { hashPurchaseToken } from "./crypto.js";
import type { EntitlementTokenSigner } from "./token.js";

export interface VerificationServiceOptions {
  purchaseProvider: PurchaseProvider;
  integrityProvider: IntegrityProvider;
  store: EntitlementStore;
  tokenSigner?: EntitlementTokenSigner;
}

export async function verify(request: VerificationRequest, options: VerificationServiceOptions): Promise<VerificationResponse> {
  const verificationId = randomUUID();
  const definition = validateApp(request.app);
  if (!definition) return { status: "denied", reason: "unknown_application", verificationId };
  if (!request.purchaseToken) return { status: "unavailable", reason: "purchase_evidence_required", verificationId };

  const purchase = await options.purchaseProvider.verify({ app: request.app, purchaseToken: request.purchaseToken });
  if (!purchase.valid || !purchase.subjectId || !purchase.productId) {
    return { status: "unavailable", reason: "purchase_not_verified", verificationId };
  }

  const product = findProduct(definition, purchase.productId);
  if (!product || !canGrant(definition, product.entitlementId)) {
    return { status: "denied", reason: "product_not_entitled", verificationId };
  }

  if (!request.integrityToken) return { status: "unavailable", reason: "integrity_evidence_required", verificationId };

  const integrity = await options.integrityProvider.verify({
    app: request.app,
    integrityToken: request.integrityToken,
    requestHash: request.integrityRequestHash,
  });
  if (!integrity.valid) return { status: "denied", reason: integrity.reason ?? "integrity_failed", verificationId };
  if (integrity.appId && integrity.appId !== request.app.appId) return { status: "denied", reason: "application_mismatch", verificationId };
  if (integrity.packageName && integrity.packageName !== request.app.packageName) return { status: "denied", reason: "package_mismatch", verificationId };
  if (integrity.subjectId && integrity.subjectId !== purchase.subjectId) return { status: "denied", reason: "subject_mismatch", verificationId };

  const entitlement = {
    appId: request.app.appId,
    subjectId: purchase.subjectId,
    id: product.entitlementId,
    status: "active" as const,
    expiresAt: purchase.expiresAt,
    policyVersion: 1,
    productId: purchase.productId,
    purchaseTokenHash: hashPurchaseToken(request.purchaseToken),
    updatedAt: new Date().toISOString(),
  };
  options.store.put(entitlement);

  const response: VerificationResponse = {
    status: "verified",
    verificationId,
    entitlement,
  };
  if (options.tokenSigner) {
    response.signedEntitlementToken = options.tokenSigner.sign({
      appId: request.app.appId,
      subjectId: purchase.subjectId,
      productId: purchase.productId,
      entitlement,
      verificationId,
    });
  }
  return response;
}
