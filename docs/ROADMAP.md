# Security Roadmap

## Phase 1 — Foundation
- Central repository and security model.
- App registry and entitlement model.
- Server verification boundary.
- Google Play purchase and Play Integrity provider interfaces.
- Flutter request binding and verification client.

## Phase 2 — Flutter commerce client
- Google Play Billing through Flutter's official in_app_purchase plugin.
- Store product → security entitlement mapping.
- Purchase evidence extraction.
- Purchase completion and restore flow.
- Secure entitlement cache using platform secure storage.

## Phase 3 — Verification backend
- Google Play purchase verification.
- Play Integrity verification with request-hash binding.
- Durable entitlement storage.
- Replay protection, rate limits, audit events and revocation.

## Phase 4 — Signed entitlement + offline grace
- Server signs verified entitlements with Ed25519.
- Client verifies the signature with an embedded public key.
- Key IDs (kid) allow public-key rotation.
- Signed tokens have a short cache lifetime even for lifetime purchases.
- Secure local cache stores the signed token, never raw entitlement authority.
- Bounded offline grace is enabled only from a still-valid signed token.

## Phase 5 — First real app
- Verify the actual package ID and Play product IDs for Resonate.
- Integrate the security client and Android Play Integrity bridge.
- Gate one premium feature first.
- Test purchase, restore, reinstall, revoke and offline cases.
- Only then reuse the system in Mercate and Video Player.

## Phase 6 — Hardening
- Configurable Play Integrity device/licensing verdict policy.
- Durable storage, replay protection, rate limits and audit events.
- Key rotation and public-key distribution strategy.
- Abuse monitoring and anomaly detection.
- Release-build/obfuscation review.
- Incident/revocation procedures.
