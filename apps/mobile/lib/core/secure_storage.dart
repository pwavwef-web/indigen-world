import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

class SecureSessionStore {
  const SecureSessionStore(this._storage);

  static const _refreshTokenKey = 'firebase_refresh_token';

  final FlutterSecureStorage _storage;

  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  Future<void> writeRefreshToken(String value) =>
      _storage.write(key: _refreshTokenKey, value: value);

  Future<void> clear() => _storage.delete(key: _refreshTokenKey);
}

final secureSessionStoreProvider = Provider<SecureSessionStore>(
  (ref) => SecureSessionStore(ref.watch(secureStorageProvider)),
);
