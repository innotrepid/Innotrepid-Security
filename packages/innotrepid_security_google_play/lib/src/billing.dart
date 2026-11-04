import 'dart:async';

import 'package:in_app_purchase/in_app_purchase.dart';

class SecurityProduct {
  const SecurityProduct({
    required this.productId,
    required this.entitlementId,
    this.consumable = false,
  });

  final String productId;
  final String entitlementId;
  final bool consumable;
}

class PurchaseEvidence {
  const PurchaseEvidence({
    required this.productId,
    required this.entitlementId,
    required this.serverVerificationData,
    required this.purchaseId,
    required this.status,
  });

  final String productId;
  final String entitlementId;
  final String serverVerificationData;
  final String? purchaseId;
  final PurchaseStatus status;
}

/// Store-facing billing coordinator. It obtains store evidence but never
/// decides whether an entitlement is granted.
class SecurityBilling {
  SecurityBilling({
    required Iterable<SecurityProduct> products,
    InAppPurchase? store,
  })  : _store = store ?? InAppPurchase.instance,
        _products = {
          for (final product in products) product.productId: product,
        };

  final InAppPurchase _store;
  final Map<String, SecurityProduct> _products;
  StreamSubscription<List<PurchaseDetails>>? _subscription;
  bool _available = false;

  bool get isAvailable => _available;

  Future<bool> initialize({
    required void Function(PurchaseEvidence evidence) onPurchase,
    void Function(Object error, StackTrace stackTrace)? onError,
  }) async {
    _available = await _store.isAvailable();
    if (!_available) return false;

    await _subscription?.cancel();
    _subscription = _store.purchaseStream.listen(
      (purchases) => _handlePurchases(purchases, onPurchase),
      onError: (Object error, StackTrace stackTrace) {
        onError?.call(error, stackTrace);
      },
    );
    return true;
  }

  Future<List<ProductDetails>> loadProducts() async {
    if (!_available) return const [];

    final ids = _products.keys.toSet();
    if (ids.isEmpty) return const [];

    final response = await _store.queryProductDetails(ids);
    if (response.error != null) {
      throw StateError(response.error!.message);
    }
    if (response.productDetails.isEmpty) {
      throw StateError('No configured security products were found.');
    }
    return response.productDetails;
  }

  Future<void> purchase(ProductDetails product) async {
    final config = _products[product.id];
    if (config == null) {
      throw ArgumentError('Product is not registered: ${product.id}');
    }

    final param = PurchaseParam(productDetails: product);
    final started = config.consumable
        ? await _store.buyConsumable(purchaseParam: param)
        : await _store.buyNonConsumable(purchaseParam: param);

    if (!started) {
      throw StateError('The store did not start the purchase flow.');
    }
  }

  Future<void> restorePurchases() => _store.restorePurchases();

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  Future<void> _handlePurchases(
    List<PurchaseDetails> purchases,
    void Function(PurchaseEvidence evidence) onPurchase,
  ) async {
    for (final purchase in purchases) {
      final config = _products[purchase.productID];
      if (config == null) continue;

      if (purchase.status == PurchaseStatus.purchased ||
          purchase.status == PurchaseStatus.restored) {
        final serverData = purchase.verificationData.serverVerificationData;
        if (serverData.isNotEmpty) {
          onPurchase(
            PurchaseEvidence(
              productId: purchase.productID,
              entitlementId: config.entitlementId,
              serverVerificationData: serverData,
              purchaseId: purchase.purchaseID,
              status: purchase.status,
            ),
          );
        }
      }

      if (purchase.pendingCompletePurchase) {
        await _store.completePurchase(purchase);
      }
    }
  }
}
