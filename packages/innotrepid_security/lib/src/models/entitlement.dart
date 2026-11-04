enum EntitlementStatus {
  unknown,
  active,
  expired,
  revoked,
  unavailable,
}

class Entitlement {
  const Entitlement({
    required this.id,
    required this.status,
    this.expiresAt,
    this.policyVersion = 1,
  });

  final String id;
  final EntitlementStatus status;
  final DateTime? expiresAt;
  final int policyVersion;

  bool get isActive {
    if (status != EntitlementStatus.active) return false;
    if (expiresAt == null) return true;
    return expiresAt!.isAfter(DateTime.now().toUtc());
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'status': status.name,
        'expiresAt': expiresAt?.toUtc().toIso8601String(),
        'policyVersion': policyVersion,
      };

  factory Entitlement.fromJson(Map<String, dynamic> json) {
    final rawStatus = json['status'] as String? ?? 'unknown';
    final status = EntitlementStatus.values.firstWhere(
      (value) => value.name == rawStatus,
      orElse: () => EntitlementStatus.unknown,
    );

    return Entitlement(
      id: json['id'] as String? ?? '',
      status: status,
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.tryParse(json['expiresAt'] as String),
      policyVersion: json['policyVersion'] as int? ?? 1,
    );
  }
}
