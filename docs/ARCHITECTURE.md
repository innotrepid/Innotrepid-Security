# Security Architecture

## Goals

1. Provide one reusable protection system for multiple Innotrepid apps.
2. Keep premium entitlement decisions verifiable server-side.
3. Use Google Play purchase verification and Play Integrity where applicable.
4. Support offline-friendly apps without making offline state authoritative.
5. Allow entitlement revocation and policy changes without embedding a new secret in every app.
6. Keep application identities and products isolated.

## Trust boundaries

### Client

The Flutter SDK collects purchase and integrity evidence and may cache the last known entitlement. Client state is untrusted.

### Server

The server is the authority for entitlement resolution. It verifies external evidence and issues a limited entitlement response.

### Application

The application consumes entitlement results and gates legitimate features. UI checks are not security boundaries.

## Application identity

Each app receives an independent identity:

- application identifier
- Android package name
- signing certificate identity
- Play application identifier
- product identifiers
- entitlement definitions

Initial apps: Resonate, Mercate, and Video Player.

## Verification flow

1. App initializes the SDK with its registered identity.
2. App obtains purchase evidence where relevant.
3. App requests an integrity verdict.
4. Evidence is sent to the verification backend.
5. Backend verifies purchase and integrity evidence.
6. Backend resolves the current entitlement.
7. App receives a validated entitlement response.
8. App gates premium functionality from that response.

## Offline behavior

A cached entitlement may support a deliberately limited grace period. Cached client state must never become permanent premium authorization.

## Anti-tamper philosophy

The goal is not to make an APK impossible to modify. The goal is to ensure that modifying the APK alone is insufficient to obtain server-authorized premium entitlement.
