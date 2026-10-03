import type { AppIdentity } from "./domain.js";

export interface PurchaseVerification {
  valid: boolean;
  subjectId?: string;
  productId?: string;
  expiresAt?: string;
  purchaseToken?: string;
}

export interface IntegrityVerification {
  valid: boolean;
  appId?: string;
  packageName?: string;
  subjectId?: string;
  reason?: string;
}

export interface PurchaseProvider {
  verify(input: {
    app: AppIdentity;
    purchaseToken: string;
  }): Promise<PurchaseVerification>;
}

export interface IntegrityProvider {
  verify(input: {
    app: AppIdentity;
    integrityToken: string;
    requestHash?: string;
  }): Promise<IntegrityVerification>;
}

export class UnconfiguredPurchaseProvider implements PurchaseProvider {
  async verify(): Promise<PurchaseVerification> {
    return { valid: false };
  }
}

export class UnconfiguredIntegrityProvider implements IntegrityProvider {
  async verify(): Promise<IntegrityVerification> {
    return { valid: false, reason: "provider_not_configured" };
  }
}
