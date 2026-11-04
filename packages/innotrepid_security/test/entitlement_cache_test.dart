import 'package:flutter_test/flutter_test.dart';
import 'package:innotrepid_security/innotrepid_security.dart';

class _MemorySecureStorage implements SecureKeyValueStorage {
  final Map<String, String> values = {};

  @override
  Future<String?> read({required String key}) async => values[key];

  @override
  Future<void> write({
    required String key,
    required String value,
  }) async {
    values[key] = value;
  }

  @override
  Future<void> delete({required String key}) async {
    values.remove(key);
  }
}

void main() {
  test('cache isolates app and entitlement keys', () async {
    final storage = _MemorySecureStorage();
    final cache = EntitlementCache(storage: storage);

    await cache.write(
      appId: 'resonate',
      entitlement: const Entitlement(
        id: 'premium',
        status: EntitlementStatus.active,
      ),
      signedToken: 'signed-resonate-token',
    );
    await cache.write(
      appId: 'mercate',
      entitlement: const Entitlement(
        id: 'pro',
        status: EntitlementStatus.active,
      ),
      signedToken: 'signed-mercate-token',
    );

    final resonate = await cache.read(
      appId: 'resonate',
      entitlementId: 'premium',
    );
    final mercate = await cache.read(
      appId: 'mercate',
      entitlementId: 'pro',
    );

    expect(resonate?.signedToken, 'signed-resonate-token');
    expect(mercate?.signedToken, 'signed-mercate-token');
    expect(storage.values.length, 2);
    expect(storage.values.keys.toSet().length, 2);
  });

  test('delete removes only the requested entitlement key', () async {
    final storage = _MemorySecureStorage();
    final cache = EntitlementCache(storage: storage);

    await cache.write(
      appId: 'resonate',
      entitlement: const Entitlement(
        id: 'premium',
        status: EntitlementStatus.active,
      ),
      signedToken: 'resonate-token',
    );
    await cache.write(
      appId: 'mercate',
      entitlement: const Entitlement(
        id: 'pro',
        status: EntitlementStatus.active,
      ),
      signedToken: 'mercate-token',
    );

    await cache.delete(appId: 'resonate', entitlementId: 'premium');

    expect(
      await cache.read(appId: 'resonate', entitlementId: 'premium'),
      isNull,
    );
    expect(
      (await cache.read(appId: 'mercate', entitlementId: 'pro'))?.signedToken,
      'mercate-token',
    );
  });
}
