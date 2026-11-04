# Secure Entitlement Cache

The Flutter package now provides an EntitlementCache backed by platform secure
storage.

The cache protects stored entitlement data from ordinary plaintext preference
storage, but secure storage alone does not prove that the entitlement was
issued by the Innotrepid Security backend.

Therefore:

- verified online entitlements may be written to the cache;
- cached entitlements must not become permanent authorization;
- offline grace must not be enabled from unsigned JSON;
- the next phase adds a short-lived server-signed entitlement token;
- the signing private key stays exclusively on the server;
- the app will contain only the public verification key.

The current cache is a storage hardening layer, not the final offline
authorization mechanism.
