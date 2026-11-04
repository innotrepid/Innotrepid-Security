import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:innotrepid_security/innotrepid_security.dart';

void main() {
  final app = const SecurityApp(
    appId: 'resonate',
    packageName: 'com.Aetherion.Resonate',
    version: '1.0.0',
    buildNumber: '42',
  );

  test('builds a request hash without exposing the purchase token', () {
    final client = SecurityClient(
      app: app,
      baseUrl: 'https://security.example',
    );

    final payload = client.buildVerificationRequest(
      requestId: 'request-1',
      purchaseToken: 'secret-purchase-token',
      integrityToken: 'integrity-token',
    );

    expect(payload['purchaseToken'], 'secret-purchase-token');
    expect(payload['integrityRequestHash'], isA<String>());
    expect(
      payload['integrityRequestHash'],
      isNot(contains('secret-purchase-token')),
    );
  });

  test('accepts a verified response only with a valid signed entitlement', () async {
    final algorithm = Ed25519();
    final keyPair = await algorithm.newKeyPair();
    final publicKey = await keyPair.extractPublicKey();
    final publicKeyBase64Url =
        base64UrlEncode(publicKey.bytes).replaceAll('=', '');
    final tokenVerifier = SignedEntitlementVerifier(
      publicKeyBase64Url: publicKeyBase64Url,
    );

    final now = DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000;
    final header = base64UrlEncode(utf8.encode(jsonEncode({
      'alg': 'EdDSA',
      'typ': 'JWT',
      'kid': 'test-key',
    }))).replaceAll('=', '');
    final payload = base64UrlEncode(utf8.encode(jsonEncode({
      'iss': 'innotrepid-security',
      'aud': 'resonate',
      'appId': 'resonate',
      'entitlementId': 'premium',
      'status': 'active',
      'policyVersion': 1,
      'iat': now,
      'exp': now + 3600,
      'cacheUntil': now + 900,
      'verificationId': 'verification-1',
      'subjectId': 'user-1',
      'productId': 'resonate_premium',
      'kid': 'test-key',
    }))).replaceAll('=', '');
    final signingInput = '$header.$payload';
    final signature = await algorithm.sign(
      utf8.encode(signingInput),
      keyPair: keyPair,
    );
    final signedToken =
        '$signingInput.${base64UrlEncode(signature.bytes).replaceAll('=', '')}';

    final client = SecurityClient(
      app: app,
      baseUrl: 'https://security.example',
      tokenVerifier: tokenVerifier,
      httpClient: MockClient((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/v1/verify');

        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['requestId'], 'request-1');
        expect(body['integrityRequestHash'], isA<String>());

        return http.Response(
          jsonEncode({
            'status': 'verified',
            'verificationId': 'verification-1',
            'signedEntitlementToken': signedToken,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final result = await client.verify(
      requestId: 'request-1',
      purchaseToken: 'purchase-token',
      integrityToken: 'integrity-token',
    );

    expect(result.status, VerificationStatus.verified);
    expect(result.entitlement?.id, 'premium');
    expect(result.isPremium, isTrue);
    expect(client.hasEntitlement('premium'), isTrue);
  });

  test('does not retain entitlement after server denial', () async {
    final client = SecurityClient(
      app: app,
      baseUrl: 'https://security.example',
      httpClient: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'status': 'denied',
            'reason': 'product_not_entitled',
            'verificationId': 'verification-2',
          }),
          403,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    client.applyEntitlement(
      const Entitlement(id: 'premium', status: EntitlementStatus.active),
    );

    final result = await client.verify(
      requestId: 'request-2',
      purchaseToken: 'purchase-token',
      integrityToken: 'integrity-token',
    );

    expect(result.status, VerificationStatus.denied);
    expect(client.entitlement, isNull);
  });
}
