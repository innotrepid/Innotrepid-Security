# Innotrepid Security

Central security, licensing, entitlement, and integrity infrastructure for Innotrepid applications.

## Purpose

A reusable protection layer shared by multiple applications. It separates entitlement, license verification, app integrity, and feature gating. The client is never the ultimate authority for premium access.

## Planned architecture

```
Flutter App
   │ purchase evidence + integrity token + app identity
   ▼
Innotrepid Security API
   │ purchase verification + integrity verification
   │ entitlement resolution + revocation policy
   ▼
Signed entitlement
   ▼
App feature gate
```

## Repository layout

- `packages/` — reusable client SDKs
- `server/` — verification services
- `docs/` — architecture and integration documentation
- `config/` — application definitions and entitlement schemas
- `test/` — security and contract tests

## Security principle

No client-side secret is a reliable authorization mechanism. Premium authorization must remain verifiable independently of a modified application binary.

## Status

Foundation phase. No production credentials, signing secrets, purchase tokens, or private keys belong in this repository.

## Optional platform storage

The core `innotrepid_security` package does not require a platform secure-storage plugin. Applications that need the signed-entitlement cache provide a `SecureKeyValueStorage` implementation.

For Flutter Secure Storage, add the optional `innotrepid_security_secure_storage` package and configure:

```dart
final cache = EntitlementCache(
  storage: FlutterSecureStorageAdapter(),
);
```

Apps that only need offline Ed25519 licence verification can depend on the core package without pulling in `flutter_secure_storage`. This keeps unrelated platform plugin constraints out of direct-distribution apps.

The cache uses distinct keys per app ID and entitlement ID; tests cover cross-app isolation and targeted deletion.
