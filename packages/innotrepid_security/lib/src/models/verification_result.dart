import 'entitlement.dart';

enum VerificationStatus {
  verified,
  denied,
  unavailable,
}

class VerificationResult {
  const VerificationResult({
    required this.status,
    this.entitlement,
    this.reason,
  });

  final VerificationStatus status;
  final Entitlement? entitlement;
  final String? reason;

  bool get isPremium =>
      status == VerificationStatus.verified &&
      entitlement != null &&
      entitlement!.isActive;
}
