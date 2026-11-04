# Mercate Key Manager — issuer core

This phase adds a server-side issuance primitive for the existing Mercate v1 offline licence contract. It is not yet a customer-facing admin console or a production-ready issuance service.

## Security boundary

- The issuer runs outside the Mercate app.
- Mercate receives only the signed token and the build receives only the matching public key.
- The signing implementation accepts a PEM key supplied at runtime. Production deployment must source it from a managed secret store or HSM-backed signing adapter; do not put key material in source control, CI variables exposed to builds, APKs, logs, or client settings.
- The PEM adapter is a server-side integration seam, not a claim that plain environment variables are the preferred production key custody design.
- Issuance history, revocation, authentication, durable storage, rate limiting and operator audit are not implemented in this phase. Do not expose an issuance endpoint until those controls exist.

## v1 compatibility

The issuer signs the exact UTF-8 bytes of a JSON payload and emits:

`base64url(payload).base64url(ed25519Signature)`

This is the exact two-part format consumed by `Ed25519LicenseVerifier` in the Flutter SDK and by Mercate. No JWT header, key ID, cadence field or other new claim is added to v1.

## Terms

- Weekly: exactly seven elapsed days.
- Monthly: one calendar month in the selected IANA billing timezone, preserving local wall-clock time and clamping the day to the target month's final day (including leap years). The default timezone is UTC; callers should explicitly pass the business billing timezone.
- Custom: explicit expiry timestamp with a UTC offset.
- Grace days and device allowance are signed per issue. A null device allowance means unlimited; device enforcement remains a later enrolment feature.

The resulting `expiresAt` is converted to UTC and signed as the authoritative instant.

## Next required phases before customer use

1. Durable licence/customer registry with one current licence per business and immutable issue history.
2. Authenticated operator access and append-only audit events.
3. Key custody adapter backed by a managed KMS/HSM, key rotation and recovery procedure.
4. Authenticated issue/renew/revoke/replace API with idempotency and concurrency protection.
5. Operator UI with copy/export and confirmation before irreversible actions.
6. Contract test that issues a token here and verifies it through the exact Dart SDK verifier.

Never issue live customer licences using this development-only foundation.
