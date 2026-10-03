import 'package:flutter/services.dart';

import 'integrity.dart';

class AndroidPlayIntegrityTokenProvider implements IntegrityTokenProvider {
  AndroidPlayIntegrityTokenProvider({
    required this.cloudProjectNumber,
  });

  static const MethodChannel _channel =
      MethodChannel('innotrepid_security/play_integrity');

  final int cloudProjectNumber;

  @override
  Future<String?> requestToken({
    required String requestHash,
  }) async {
    try {
      return await _channel.invokeMethod<String>(
        'requestToken',
        <String, dynamic>{
          'requestHash': requestHash,
          'cloudProjectNumber': cloudProjectNumber,
        },
      );
    } on PlatformException {
      return null;
    }
  }
}
