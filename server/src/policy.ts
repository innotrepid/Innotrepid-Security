export interface VerificationPolicy {
  allowOfflineGrace: boolean;
  offlineGraceHours: number;
  requirePurchaseEvidence: boolean;
  requireIntegrityEvidence: boolean;
}

export const defaultPolicy: VerificationPolicy = {
  allowOfflineGrace: true,
  offlineGraceHours: 72,
  requirePurchaseEvidence: true,
  requireIntegrityEvidence: true,
};
