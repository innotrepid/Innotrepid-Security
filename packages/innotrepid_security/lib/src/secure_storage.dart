/// Minimal storage contract used by the signed entitlement cache.
///
/// Platform-backed implementations live in optional adapter packages so
/// applications that only need offline token verification do not inherit
/// platform storage plugins they never use.
abstract interface class SecureKeyValueStorage {
  Future<String?> read({required String key});

  Future<void> write({
    required String key,
    required String value,
  });

  Future<void> delete({required String key});
}
