# Billing Architecture

The billing client is deliberately not the entitlement authority.

Flow:

1. The app asks Google Play for configured products.
2. The user purchases or restores a product.
3. SecurityBilling extracts the store's server verification data.
4. The app sends that evidence to SecurityClient.verify() together with Play Integrity evidence.
5. The Innotrepid Security backend verifies the purchase with Google.
6. The backend verifies Play Integrity and the request hash.
7. Only the backend grants the entitlement.

## Product IDs vs entitlements

A Google Play product ID is a store identifier. An entitlement is a feature-access identifier. They must be explicitly mapped.

The mappings in config/apps.yaml are templates until the actual Play Console product IDs and app package IDs are confirmed.

## Important

The Flutter client must never:

- treat a successful purchase callback as permanent premium authorization;
- store a master authorization secret;
- decide that a locally cached purchase token is proof of ownership;
- send purchase tokens anywhere except the HTTPS security backend.

The backend remains authoritative.
