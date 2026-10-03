# Google Verification

`GooglePlayPurchaseProvider` verifies current Google Play purchase state using the Android Publisher API.
`GooglePlayIntegrityProvider` sends Play Integrity tokens to Google's decode service and checks package identity, app recognition, and token freshness.

Google recommends checking `requestDetails` against the original request, including the request hash. The current provider contract is prepared for that binding, but the Flutter request-hash flow must be completed before production rollout.

Credentials must remain server-side. Use Application Default Credentials or a deployment secret manager; never ship service-account credentials in an app.

References:
- https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2
- https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
- https://developer.android.com/google/play/integrity/verdicts