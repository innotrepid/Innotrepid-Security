abstract interface class IntegrityTokenProvider {
  Future<String?> requestToken({
    required String requestHash,
  });
}

class UnavailableIntegrityTokenProvider implements IntegrityTokenProvider {
  const UnavailableIntegrityTokenProvider();

  @override
  Future<String?> requestToken({required String requestHash}) async => null;
}
