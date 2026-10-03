# Play Integrity Client Boundary

The package exposes a platform-neutral IntegrityTokenProvider.

The Flutter application supplies an Android implementation that obtains a
Play Integrity standard-request token using the same request hash that is
sent to the Innotrepid Security backend.

The backend must verify:

- request package name;
- request hash;
- token freshness;
- app recognition;
- the configured device and licensing verdict policy.

The client never receives or stores Google service-account credentials.

A concrete Android implementation is intentionally kept separate from the
core package so the central entitlement/security code does not depend on an
unverified third-party Flutter plugin.
