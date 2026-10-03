import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import 'models/entitlement.dart';
import 'models/security_app.dart';
import 'models/verification_result.dart';

class SecurityClient {
  SecurityClient({
    required this.app,
    required this.baseUrl,
    http.Client? httpClient,
  }) : _httpClient = httpClient ?? http.Client();

  final SecurityApp app;
  final String baseUrl;
  final http.Client _httpClient;
  Entitlement? _entitlement;

  Entitlement? get entitlement => _entitlement;

  bool hasEntitlement(String entitlementId) =>
      _entitlement?.id == entitlementId && _entitlement!.isActive;

  void applyEntitlement(Entitlement entitlement) {
    _entitlement = entitlement;
  }

  void clearEntitlement() {
    _entitlement = null;
  }

  Map<String, dynamic> buildVerificationRequest({
    required String requestId,
    String? purchaseToken,
    String? integrityToken,
  }) {
    final request = <String, dynamic>{
      'requestId': requestId,
      'app': app.toJson(),
      if (purchaseToken != null) 'purchaseToken': purchaseToken,
      if (integrityToken != null) 'integrityToken': integrityToken,
    };

    if (purchaseToken != null) {
      request['integrityRequestHash'] = buildIntegrityRequestHash(
        requestId: requestId,
        purchaseToken: purchaseToken,
      );
    }

    return request;
  }

  String buildIntegrityRequestHash({
    required String requestId,
    String? purchaseToken,
  }) {
    final purchaseHash = purchaseToken == null
        ? ''
        : _sha256Base64Url(utf8.encode(purchaseToken));

    final canonical = [
      requestId,
      app.appId,
      app.packageName,
      app.version,
      app.buildNumber ?? '',
      purchaseHash,
    ].join('|');

    return _sha256Base64Url(utf8.encode(canonical));
  }

  Future<VerificationResult> verify({
    String? purchaseToken,
    String? integrityToken,
    String? requestId,
  }) async {
    final id = requestId ?? _newRequestId();
    final payload = buildVerificationRequest(
      requestId: id,
      purchaseToken: purchaseToken,
      integrityToken: integrityToken,
    );

    try {
      final response = await _httpClient
          .post(
            Uri.parse('${baseUrl.replaceFirst(RegExp(r'/+$'), '')}/v1/verify'),
            headers: const {'content-type': 'application/json'},
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 15));

      final body = _decodeObject(response.body);

      if (response.statusCode == 200 && body['status'] == 'verified') {
        final rawEntitlement = body['entitlement'];
        if (rawEntitlement is! Map) {
          return const VerificationResult(
            status: VerificationStatus.unavailable,
            reason: 'entitlement_missing',
          );
        }

        final entitlement = Entitlement.fromJson(
          Map<String, dynamic>.from(rawEntitlement),
        );
        applyEntitlement(entitlement);
        return VerificationResult(
          status: VerificationStatus.verified,
          entitlement: entitlement,
        );
      }

      if (response.statusCode == 403 || body['status'] == 'denied') {
        clearEntitlement();
        return VerificationResult(
          status: VerificationStatus.denied,
          reason: body['reason'] as String?,
        );
      }

      return VerificationResult(
        status: VerificationStatus.unavailable,
        reason: body['reason'] as String? ?? 'verification_unavailable',
      );
    } catch (_) {
      return const VerificationResult(
        status: VerificationStatus.unavailable,
        reason: 'verification_request_failed',
      );
    }
  }

  Map<String, dynamic> _decodeObject(String source) {
    final decoded = jsonDecode(source);
    if (decoded is! Map) {
      throw const FormatException('verification_response_not_object');
    }
    return Map<String, dynamic>.from(decoded);
  }

  String _newRequestId() {
    final random = Random.secure();
    final timestamp = DateTime.now().toUtc().microsecondsSinceEpoch;
    final entropy = List<int>.generate(16, (_) => random.nextInt(256));
    final digest = sha256.convert(
      utf8.encode('$timestamp:${base64UrlEncode(entropy)}'),
    );
    return digest.toString();
  }

  String _sha256Base64Url(List<int> bytes) =>
      base64UrlEncode(sha256.convert(bytes).bytes).replaceAll('=', '');
}
