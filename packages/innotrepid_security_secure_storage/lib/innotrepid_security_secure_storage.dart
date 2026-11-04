import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:innotrepid_security/innotrepid_security.dart';

/// Optional platform-backed adapter for [SecureKeyValueStorage].
class FlutterSecureStorageAdapter implements SecureKeyValueStorage {
  FlutterSecureStorageAdapter({
    FlutterSecureStorage? storage,
  }) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read({required String key}) => _storage.read(key: key);

  @override
  Future<void> write({
    required String key,
    required String value,
  }) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete({required String key}) => _storage.delete(key: key);
}
