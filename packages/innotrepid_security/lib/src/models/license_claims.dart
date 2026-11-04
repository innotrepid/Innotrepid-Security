class LicenseClaims {
  const LicenseClaims({
    required this.schemaVersion,
    required this.product,
    required this.businessId,
    required this.licenseId,
    required this.issuedAt,
    required this.expiresAt,
    required this.graceDays,
    this.maxDevices,
  });

  final int schemaVersion;
  final String product;
  final String businessId;
  final String licenseId;
  final DateTime issuedAt;
  final DateTime expiresAt;
  final int graceDays;
  final int? maxDevices;

  factory LicenseClaims.fromJson(Map<String, dynamic> json) {
    final schemaVersion = json['schemaVersion'];
    final product = json['product'];
    final businessId = json['businessId'];
    final licenseId = json['licenseId'];
    final graceDays = json['graceDays'] ?? 0;
    final maxDevices = json['maxDevices'];

    if (schemaVersion is! int ||
        schemaVersion != 1 ||
        product is! String ||
        product.trim().isEmpty ||
        businessId is! String ||
        businessId.trim().isEmpty ||
        licenseId is! String ||
        licenseId.trim().isEmpty ||
        graceDays is! int ||
        graceDays < 0 ||
        (maxDevices != null && (maxDevices is! int || maxDevices < 1))) {
      throw const FormatException('Unsupported or invalid licence claims.');
    }

    final issuedRaw = json['issuedAt'];
    final expiresRaw = json['expiresAt'];
    if (issuedRaw is! String ||
        expiresRaw is! String ||
        !_hasExplicitOffset(issuedRaw) ||
        !_hasExplicitOffset(expiresRaw)) {
      throw const FormatException(
        'Licence timestamps must include an explicit UTC offset.',
      );
    }

    final issuedAt = DateTime.tryParse(issuedRaw);
    final expiresAt = DateTime.tryParse(expiresRaw);
    if (issuedAt == null ||
        expiresAt == null ||
        !expiresAt.isAfter(issuedAt)) {
      throw const FormatException('Invalid licence validity period.');
    }

    return LicenseClaims(
      schemaVersion: schemaVersion,
      product: product,
      businessId: businessId,
      licenseId: licenseId,
      issuedAt: issuedAt.toUtc(),
      expiresAt: expiresAt.toUtc(),
      graceDays: graceDays,
      maxDevices: maxDevices as int?,
    );
  }

  static bool _hasExplicitOffset(String value) =>
      RegExp(r'(?:Z|[+-]\d{2}:\d{2})$', caseSensitive: false)
          .hasMatch(value);
}
