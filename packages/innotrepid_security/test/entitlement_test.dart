import 'package:flutter_test/flutter_test.dart';
import 'package:innotrepid_security/innotrepid_security.dart';

void main() {
  test('active entitlement is available', () {
    const entitlement = Entitlement(
      id: 'premium',
      status: EntitlementStatus.active,
    );

    expect(entitlement.isActive, isTrue);
  });

  test('revoked entitlement is unavailable', () {
    const entitlement = Entitlement(
      id: 'premium',
      status: EntitlementStatus.revoked,
    );

    expect(entitlement.isActive, isFalse);
  });

  test('expired entitlement is unavailable', () {
    final entitlement = Entitlement(
      id: 'premium',
      status: EntitlementStatus.active,
      expiresAt: DateTime.now().toUtc().subtract(const Duration(minutes: 1)),
    );

    expect(entitlement.isActive, isFalse);
  });
}
