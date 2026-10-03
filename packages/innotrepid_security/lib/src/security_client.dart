import 'models/entitlement.dart';
import 'models/security_app.dart';

class SecurityClient {
  SecurityClient({required this.app});

  final SecurityApp app;
  Entitlement? _entitlement;

  Entitlement? get entitlement => _entitlement;
  bool hasEntitlement(String entitlementId) =>
      _entitlement?.id == entitlementId && _entitlement!.isActive;

  void applyEntitlement(Entitlement entitlement) {
    _entitlement = entitlement;
  }

  void clearEntitlement() {
    _entitlement = null;
  }

  Map<String, dynamic> buildVerificationRequest({
    String? purchaseToken,
    String? integrityToken,
  }) {
    return {
      'app': app.toJson(),
      'purchaseToken': purchaseToken,
      'integrityToken': integrityToken,
    };
  }
}
