import 'dart:convert';

import 'package:cryptography/cryptography.dart';

import 'models/entitlement.dart';

class SignedEntitlementVerifier {
  SignedEntitlementVerifier({required String publicKeyBase64Url})
      : _publicKey = SimplePublicKey(
          base64Url.decode(_pad(publicKeyBase64Url)),
          type: KeyPairType.ed25519,
        );

  final SimplePublicKey _publicKey;
  final Ed25519 _algorithm = Ed25519();

  Future<Entitlement?> verify(String token, {required String appId}) async {
    final parts = token.split('.');
    if (parts.length != 3) return null;

    try {
      final header = _decode(parts[0]);
      final payload = _decode(parts[1]);
      final signature = base64Url.decode(_pad(parts[2]));

      if (header['alg'] != 'EdDSA' || header['typ'] != 'JWT') return null;
      if (payload['appId'] != appId || payload['aud'] != appId) return null;
      if (payload['kid'] != header['kid']) return null;

      final now = DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000;
      final exp = _intClaim(payload, 'exp');
      final cacheUntil = _intClaim(payload, 'cacheUntil');
      final issuedAt = _intClaim(payload, 'iat');
      if (exp == null || cacheUntil == null || issuedAt == null) return null;
      if (issuedAt > now + 30 || exp <= now || cacheUntil <= now || cacheUntil > exp) return null;

      final valid = await _algorithm.verify(
        utf8.encode(parts[0] + '.' + parts[1]),
        signature: Signature(signature, publicKey: _publicKey),
      );
      if (!valid) return null;

      final status = payload['status'] as String?;
      final id = payload['entitlementId'] as String?;
      if (id == null || id.isEmpty || status == null) return null;

      return Entitlement.fromJson({
        'id': id,
        'status': status,
        'policyVersion': payload['policyVersion'] ?? 1,
      });
    } catch (_) {
      return null;
    }
  }

  static Map<String, dynamic> _decode(String value) {
    final decoded = jsonDecode(
      utf8.decode(base64Url.decode(_pad(value))),
    );
    if (decoded is! Map) throw const FormatException('token_part_not_object');
    return Map<String, dynamic>.from(decoded);
  }

  static int? _intClaim(Map<String, dynamic> payload, String key) {
    final value = payload[key];
    return value is int ? value : int.tryParse('$value');
  }

  static String _pad(String value) {
    final padding = (4 - value.length % 4) % 4;
    return value + ('=' * padding);
  }
}
