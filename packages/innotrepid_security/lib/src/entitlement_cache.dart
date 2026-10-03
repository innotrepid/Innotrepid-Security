import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'models/entitlement.dart';

class EntitlementCache {
  EntitlementCache({
    FlutterSecureStorage? storage,
    this.keyPrefix = 'innotrepid_security.',
  }) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  final String keyPrefix;

  String _key(String appId, String entitlementId) =>
      '${keyPrefix}$appId.$entitlementId';

  Future<void> write({
    required String appId,
    required Entitlement entitlement,
  }) async {
    await _storage.write(
      key: _key(appId, entitlement.id),
      value: jsonEncode(entitlement.toJson()),
    );
  }

  Future<Entitlement?> read({
    required String appId,
    required String entitlementId,
  }) async {
    final raw = await _storage.read(
      key: _key(appId, entitlementId),
    );
    if (raw == null || raw.isEmpty) return null;

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      return Entitlement.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      return null;
    }
  }

  Future<void> delete({
    required String appId,
    required String entitlementId,
  }) => _storage.delete(
        key: _key(appId, entitlementId),
      );
}
