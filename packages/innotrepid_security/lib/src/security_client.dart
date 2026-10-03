import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import 'entitlement_cache.dart';
import 'integrity.dart';
import 'models/entitlement.dart';
import 'models/security_app.dart';
import 'models/verification_result.dart';
import 'signed_entitlement.dart';

class SecurityClient {
  SecurityClient({
    required this.app,
    required this.baseUrl,
    EntitlementCache? cache,
    SignedEntitlementVerifier? tokenVerifier,
    IntegrityTokenProvider? integrityProvider,
    http.Client? httpClient,
  })  : _httpClient = httpClient ?? http.Client(),
        _cache = cache,
        _tokenVerifier = tokenVerifier,
        _integrityProvider = integrityProvider;

  final SecurityApp app;
  final String baseUrl;
  final http.Client _httpClient;
  final EntitlementCache? _cache;
  final SignedEntitlementVerifier? _tokenVerifier;
  final IntegrityTokenProvider? _integrityProvider;
  Entitlement? _entitlement;

  Entitlement? get entitlement => _entitlement;

  bool hasEntitlement(String entitlementId) =>
      _entitlement?.id == entitlementId && _entitlement!.isActive;

  void applyEntitlement(Entitlement entitlement) => _entitlement = entitlement;
  void clearEntitlement() => _entitlement = null;

  Future<VerificationResult> loadCachedEntitlement(String entitlementId) async {
    if (_cache == null || _tokenVerifier == null) {
      return const VerificationResult(
        status: VerificationStatus.unavailable,
        reason: 'secure_cache_not_configured',
      );
    }
    final cached = await _cache.read(
      appId: app.appId,
      entitlementId: entitlementId,
    );
    if (cached == null) {
      return const VerificationResult(
        status: VerificationStatus.unavailable,
        reason: 'cache_miss',
      );
    }
    final verified = await _tokenVerifier.verify(
      cached.signedToken,
      appId: app.appId,
    );
    if (verified == null ||
        verified.id != entitlementId ||
        !verified.isActive) {
      await _cache.delete(
        appId: app.appId,
        entitlementId: entitlementId,
      );
      clearEntitlement();
      return const VerificationResult(
        status: VerificationStatus.unavailable,
        reason: 'cached_entitlement_invalid',
      );
    }
    applyEntitlement(verified);
    return VerificationResult(
      status: VerificationStatus.verified,
      entitlement: verified,
    );
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
    try {
      String? resolvedIntegrityToken = integrityToken;
      if (purchaseToken != null && resolvedIntegrityToken == null) {
        final provider = _integrityProvider;
        if (provider == null) {
          return const VerificationResult(
            status: VerificationStatus.unavailable,
            reason: 'integrity_provider_not_configured',
          );
        }
        final requestHash = buildIntegrityRequestHash(
          requestId: id,
          purchaseToken: purchaseToken,
        );
        resolvedIntegrityToken = await provider.requestToken(
          requestHash: requestHash,
        );
        if (resolvedIntegrityToken == null ||
            resolvedIntegrityToken.isEmpty) {
          return const VerificationResult(
            status: VerificationStatus.unavailable,
            reason: 'integrity_token_unavailable',
          );
        }
      }

      final response = await _httpClient.post(
        Uri.parse(
          '${baseUrl.replaceFirst(RegExp(r'/+$'), '')}/v1/verify',
        ),
        headers: const {'content-type': 'application/json'},
        body: jsonEncode(
          buildVerificationRequest(
            requestId: id,
            purchaseToken: purchaseToken,
            integrityToken: resolvedIntegrityToken,
          ),
        ),
      ).timeout(const Duration(seconds: 15));

      final body = _decodeObject(response.body);
      if (response.statusCode == 200 && body['status'] == 'verified') {
        final token = body['signedEntitlementToken'] as String?;
        if (token == null || _tokenVerifier == null) {
          return const VerificationResult(
            status: VerificationStatus.unavailable,
            reason: 'signed_entitlement_required',
          );
        }
        final entitlement = await _tokenVerifier.verify(
          token,
          appId: app.appId,
        );
        if (entitlement == null) {
          return const VerificationResult(
            status: VerificationStatus.denied,
            reason: 'invalid_entitlement_signature',
          );
        }
        if (_cache != null) {
          await _cache.write(
            appId: app.appId,
            entitlement: entitlement,
            signedToken: token,
          );
        }
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

  void dispose() => _httpClient.close();

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
    return sha256
        .convert(utf8.encode('$timestamp:${base64UrlEncode(entropy)}'))
        .toString();
  }

  String _sha256Base64Url(List<int> bytes) =>
      base64UrlEncode(sha256.convert(bytes).bytes).replaceAll('=', '');
}
