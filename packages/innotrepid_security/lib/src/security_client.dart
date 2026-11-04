import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

class SecurityApp {
  const SecurityApp({
    required this.appId,
    required this.packageName,
    required this.version,
    required this.buildNumber,
  });

  final String appId;
  final String packageName;
  final String version;
  final String buildNumber;
}

enum EntitlementStatus { active, inactive, revoked }

class Entitlement {
  const Entitlement({
    required this.id,
    required this.status,
    this.policyVersion,
  });

  final String id;
  final EntitlementStatus status;
  final int? policyVersion;

  bool get isActive => status == EntitlementStatus.active;

  factory Entitlement.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final statusRaw = json['status'];
    if (id is! String || id.isEmpty || statusRaw is! String) {
      throw const FormatException('Invalid entitlement response.');
    }
    final status = switch (statusRaw) {
      'active' => EntitlementStatus.active,
      'revoked' => EntitlementStatus.revoked,
      _ => EntitlementStatus.inactive,
    };
    final policyVersion = json['policyVersion'];
    if (policyVersion != null && policyVersion is! int) {
      throw const FormatException('Invalid entitlement policy version.');
    }
    return Entitlement(
      id: id,
      status: status,
      policyVersion: policyVersion as int?,
    );
  }
}

enum VerificationStatus { verified, denied, unavailable, invalidResponse }

class VerificationResult {
  const VerificationResult({
    required this.status,
    this.verificationId,
    this.reason,
    this.entitlement,
  });

  final VerificationStatus status;
  final String? verificationId;
  final String? reason;
  final Entitlement? entitlement;

  bool get isPremium =>
      status == VerificationStatus.verified &&
      entitlement?.isActive == true;
}

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

  bool hasEntitlement(String id) =>
      _entitlement?.id == id && _entitlement!.isActive;

  void applyEntitlement(Entitlement entitlement) {
    _entitlement = entitlement.isActive ? entitlement : null;
  }

  Map<String, dynamic> buildVerificationRequest({
    required String requestId,
    String? purchaseToken,
    String? integrityToken,
  }) {
    final identity = <String, String>{
      'requestId': requestId,
      'appId': app.appId,
      'packageName': app.packageName,
      'version': app.version,
      'buildNumber': app.buildNumber,
    };
    final requestHash = sha256.convert(utf8.encode(jsonEncode(identity))).toString();
    return {
      ...identity,
      'purchaseToken': purchaseToken,
      'integrityToken': integrityToken,
      'integrityRequestHash': requestHash,
    };
  }

  Future<VerificationResult> verify({
    required String requestId,
    String? purchaseToken,
    String? integrityToken,
  }) async {
    final uri = Uri.parse(baseUrl).resolve('/v1/verify');
    try {
      final response = await _httpClient.post(
        uri,
        headers: {'content-type': 'application/json'},
        body: jsonEncode(buildVerificationRequest(
          requestId: requestId,
          purchaseToken: purchaseToken,
          integrityToken: integrityToken,
        )),
      );
      final body = jsonDecode(response.body);
      if (body is! Map<String, dynamic>) {
        _entitlement = null;
        return const VerificationResult(
          status: VerificationStatus.invalidResponse,
        );
      }

      if (response.statusCode == 200 && body['status'] == 'verified') {
        final rawEntitlement = body['entitlement'];
        if (rawEntitlement is! Map<String, dynamic>) {
          _entitlement = null;
          return const VerificationResult(
            status: VerificationStatus.invalidResponse,
          );
        }
        final entitlement = Entitlement.fromJson(rawEntitlement);
        _entitlement = entitlement.isActive ? entitlement : null;
        return VerificationResult(
          status: VerificationStatus.verified,
          verificationId: body['verificationId'] as String?,
          entitlement: _entitlement,
        );
      }

      if (response.statusCode == 403 || body['status'] == 'denied') {
        _entitlement = null;
        return VerificationResult(
          status: VerificationStatus.denied,
          verificationId: body['verificationId'] as String?,
          reason: body['reason'] as String?,
        );
      }

      return VerificationResult(
        status: VerificationStatus.unavailable,
        reason: 'Verification service returned HTTP ${response.statusCode}.',
      );
    } on FormatException {
      _entitlement = null;
      return const VerificationResult(
        status: VerificationStatus.invalidResponse,
      );
    } catch (error) {
      return VerificationResult(
        status: VerificationStatus.unavailable,
        reason: error.toString(),
      );
    }
  }

  void close() => _httpClient.close();
}
