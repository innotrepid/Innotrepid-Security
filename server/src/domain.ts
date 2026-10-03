export type VerificationStatus =
  | "verified"
  | "denied"
  | "unavailable";

export interface AppIdentity {
  appId: string;
  packageName: string;
  version: string;
  buildNumber?: string;
}

export interface VerificationRequest {
  requestId: string;
  app: AppIdentity;
  purchaseToken?: string;
  integrityToken?: string;
}

export interface Entitlement {
  id: string;
  status: "active" | "expired" | "revoked";
  expiresAt?: string;
  policyVersion: number;
}

export interface VerificationResponse {
  status: VerificationStatus;
  entitlement?: Entitlement;
  reason?: string;
  verificationId: string;
}
