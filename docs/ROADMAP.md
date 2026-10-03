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
- Server-signed short-lived entitlement token.
- Public-key verification in the client.
- Secure local cache of the signed token.
- Bounded offline grace.
- Explicit unavailable vs denied behavior.

## Phase 5 — First real app
- Verify the actual package ID and Play product IDs for Resonate.
- Integrate the security client.
- Gate one premium feature first.
- Test purchase, restore, reinstall, revoke and offline cases.
- Only then reuse the system in Mercate and Video Player.

## Phase 6 — Hardening
- Configurable Play Integrity device/licensing verdict policy.
- Key rotation.
- Abuse monitoring and anomaly detection.
- Release-build/obfuscation review.
- Incident/revocation procedures.

## Non-goals
- Making piracy mathematically impossible.
- Putting master secrets in APKs.
- Crashing or permanently locking out legitimate users because verification is temporarily unavailable.
