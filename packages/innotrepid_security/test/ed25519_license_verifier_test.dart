import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:innotrepid_security/innotrepid_security.dart';

void main() {
  late Ed25519 algorithm;
  late KeyPair keyPair;
  late SimplePublicKey publicKey;
  late String publicKeyEncoded;
  late String token;

  setUp(() async {
    algorithm = Ed25519();
    keyPair = await algorithm.newKeyPair();
    publicKey = await keyPair.extractPublicKey();
    publicKeyEncoded = base64Url.encode(publicKey.bytes).replaceAll('=', '');
    final payload = utf8.encode(jsonEncode({
      'schemaVersion': 1,
      'product': 'mercate',
      'businessId': 'business-123',
      'licenseId': 'licence-123',
      'issuedAt': '2026-11-01T09:00:00.000Z',
      'expiresAt': '2026-12-01T09:00:00.000Z',
      'graceDays': 3,
      'maxDevices': 2,
    }));
    final signature = await algorithm.sign(payload, keyPair: keyPair);
    token = '${base64Url.encode(payload).replaceAll('=', '')}.'
        '${base64Url.encode(signature.bytes).replaceAll('=', '')}';
  });

  test('verifies Mercate v1 token and returns claims', () async {
    final verifier = Ed25519LicenseVerifier(
      publicKeyBase64Url: publicKeyEncoded,
      expectedProduct: 'mercate',
      expectedBusinessId: 'business-123',
    );

    final claims = await verifier.verify(token);

    expect(claims.licenseId, 'licence-123');
    expect(claims.maxDevices, 2);
    expect(claims.graceDays, 3);
    expect(claims.expiresAt, DateTime.utc(2026, 12, 1, 9));
  });

  test('rejects a token bound to a different business', () async {
    final verifier = Ed25519LicenseVerifier(
      publicKeyBase64Url: publicKeyEncoded,
      expectedProduct: 'mercate',
      expectedBusinessId: 'another-business',
    );

    await expectLater(
      verifier.verify(token),
      throwsA(isA<LicenseVerificationException>()),
    );
  });

  test('rejects a modified signed payload', () async {
    final parts = token.split('.');
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[0])));
    final changed = payload.replaceFirst('licence-123', 'licence-999');
    final tampered = '${base64Url.encode(utf8.encode(changed)).replaceAll('=', '')}.'
        '${parts[1]}';
    final verifier = Ed25519LicenseVerifier(
      publicKeyBase64Url: publicKeyEncoded,
      expectedProduct: 'mercate',
    );

    await expectLater(
      verifier.verify(tampered),
      throwsA(isA<LicenseVerificationException>()),
    );
  });

  test('rejects timestamps without an explicit timezone', () async {
    final payload = utf8.encode(jsonEncode({
      'schemaVersion': 1,
      'product': 'mercate',
      'businessId': 'business-123',
      'licenseId': 'licence-123',
      'issuedAt': '2026-11-01T09:00:00',
      'expiresAt': '2026-12-01T09:00:00Z',
      'graceDays': 0,
    }));
    final signature = await algorithm.sign(payload, keyPair: keyPair);
    final invalidToken =
        '${base64Url.encode(payload).replaceAll('=', '')}.'
        '${base64Url.encode(signature.bytes).replaceAll('=', '')}';
    final verifier = Ed25519LicenseVerifier(
      publicKeyBase64Url: publicKeyEncoded,
      expectedProduct: 'mercate',
    );

    await expectLater(
      verifier.verify(invalidToken),
      throwsA(isA<LicenseVerificationException>()),
    );
  });
}
