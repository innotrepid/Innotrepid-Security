import 'dart:convert';

import 'package:cryptography/cryptography.dart';

import 'license_claims.dart';

class LicenseVerificationException implements Exception {
  const LicenseVerificationException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Verifies the existing Mercate v1 wire format without changing signed bytes.
class Ed25519LicenseVerifier {
  Ed25519LicenseVerifier({
    required this.publicKeyBase64Url,
    required this.expectedProduct,
    this.expectedBusinessId,
  }) : _algorithm = Ed25519();

  final String publicKeyBase64Url;
  final String expectedProduct;
  final String? expectedBusinessId;
  final Ed25519 _algorithm;

  Future<LicenseClaims> verify(String token) async {
    try {
      final parts = token.trim().split('.');
      if (parts.length != 2 || parts.any((part) => part.isEmpty)) {
        throw const FormatException('Malformed licence token.');
      }

      final payloadBytes = _decodeBase64Url(parts[0]);
      final signatureBytes = _decodeBase64Url(parts[1]);
      final publicKeyBytes = _decodeBase64Url(publicKeyBase64Url);
      if (publicKeyBytes.length != 32 || signatureBytes.length != 64) {
        throw const FormatException('Invalid Ed25519 key or signature length.');
      }

      final publicKey = SimplePublicKey(
        publicKeyBytes,
        type: KeyPairType.ed25519,
      );
      final signature = Signature(signatureBytes, publicKey: publicKey);
      final valid = await _algorithm.verify(
        payloadBytes,
        signature: signature,
      );
      if (!valid) {
        throw const FormatException('Licence signature is invalid.');
      }

      final decoded = jsonDecode(utf8.decode(payloadBytes));
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Licence payload must be a JSON object.');
      }
      final claims = LicenseClaims.fromJson(decoded);
      if (claims.product != expectedProduct) {
        throw const FormatException('Licence belongs to a different product.');
      }
      if (expectedBusinessId != null &&
          claims.businessId != expectedBusinessId) {
        throw const FormatException('Licence belongs to a different business.');
      }
      return claims;
    } on LicenseVerificationException {
      rethrow;
    } on FormatException catch (error) {
      throw LicenseVerificationException(error.message);
    } catch (error) {
      throw LicenseVerificationException('Unable to verify licence: $error');
    }
  }

  List<int> _decodeBase64Url(String value) =>
      base64Url.decode(base64Url.normalize(value));
}
