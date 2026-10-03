# Google Verification

`GooglePlayPurchaseProvider` verifies current Google Play purchase state using the Android Publisher API.
`GooglePlayIntegrityProvider` sends Play Integrity tokens to Google's decode service and checks package identity, app recognition, and token freshness.

Google recommends checking `requestDetails` against the original request, including the request hash. The current provider contract is prepared for that binding, but the Flutter request-hash flow must be completed before production rollout.

Credentials must remain server-side. Use Application Default Credentials or a deployment secret manager; never ship service-account credentials in an app.

References:
- https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2
- https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
- https://developer.android.com/google/play/integrity/verdicts

## Flutter request binding

The Flutter package now generates an integrityRequestHash from a canonical request containing the request ID, application identity, version/build, and a SHA-256 digest of the purchase token. The purchase token itself is still sent only as HTTPS request data; it is not embedded in the Play Integrity request hash.

The server passes this hash to Google Play Integrity and rejects a decoded token when Google's requestDetails.requestHash does not match.

The Flutter client uses package:crypto for SHA-256 and package:http for the verification request. These are currently crypto 3.0.7 and http 1.6.0. 

The verification endpoint must be HTTPS in production. The client deliberately has no reusable authorization secret; the purchase token and Play Integrity token are evidence, not credentials.
