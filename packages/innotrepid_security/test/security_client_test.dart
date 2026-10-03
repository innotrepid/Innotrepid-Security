import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:innotrepid_security/innotrepid_security.dart';

void main() {
  final app = const SecurityApp(
    appId: 'resonate',
    packageName: 'com.innotrepid.resonate',
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

  test('accepts a verified entitlement response', () async {
    final client = SecurityClient(
      app: app,
      baseUrl: 'https://security.example',
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
            'entitlement': {
              'id': 'premium',
              'status': 'active',
              'policyVersion': 1,
            },
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
