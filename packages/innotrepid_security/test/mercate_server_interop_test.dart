import 'package:flutter_test/flutter_test.dart';
import 'package:innotrepid_security/innotrepid_security.dart';

// This fixture is also asserted against the server issuer in its Node test.
void main() {
  test('verifies a token emitted by the Mercate TypeScript server issuer', () async {
    const publicKeyBase64Url = 'Olz6mYSwK869UfCu4yAmgNpoBL8kQdzEaZBZ1fyoxrk';
    const payload = 'eyJzY2hl' 'bWFWZXJzaW9uIjoxLCJwcm9kdWN0IjoibWVyY2F0ZSIsImJ1c2luZXNzSWQiOiJjcm9zcy1sYW5ndWFnZS1idXNpbmVzcy0wMDEiLCJsaWNlbnNlSWQiOiJjcm9zcy1sYW5ndWFnZS1saWNlbnNlLTAwMSIsImlzc3VlZEF0IjoiMjAyNi0xMS0wNFQwOToxNTowMC4wMDBaIiwiZXhwaXJlc0F0IjoiMjAyNi0xMS0xMVQwOToxNTowMC4wMDBaIiwiZ3JhY2VEYXlzIjo0LCJtYXhEZXZpY2VzIjozfQ';
    const signature = '26ON5IivEoWRgd3-2p49lDzTuatmgLhbFjrQBOgYCqbN3UmKxnkDko9hvkBcl-AFKAQcK4AY-3eLgVJXAXniAA';
    final token = '$payload.$signature';

    final claims = await Ed25519LicenseVerifier(
      publicKeyBase64Url: publicKeyBase64Url,
      expectedProduct: 'mercate',
      expectedBusinessId: 'cross-language-business-001',
    ).verify(token);

    expect(claims.schemaVersion, 1);
    expect(claims.product, 'mercate');
    expect(claims.businessId, 'cross-language-business-001');
    expect(claims.licenseId, 'cross-language-license-001');
    expect(claims.issuedAt, DateTime.utc(2026, 11, 4, 9, 15));
    expect(claims.expiresAt, DateTime.utc(2026, 11, 11, 9, 15));
    expect(claims.graceDays, 4);
    expect(claims.maxDevices, 3);
  });
}
