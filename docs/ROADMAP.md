# Roadmap

## Phase 1 — Foundation
- Repository structure
- Application identity model
- Entitlement model
- SDK/server contracts
- Security documentation
- Secret-handling rules

## Phase 2 — Flutter SDK
- SDK initialization
- Application registration
- Entitlement state model
- Secure local cache
- Verification client
- Feature-gate API

## Phase 3 — Verification backend
- App-request authentication
- Google Play purchase verification
- Play Integrity verification
- Entitlement resolution
- Revocation
- Audit events
- Rate limiting

## Phase 4 — First production integration
- Resonate integration
- Premium product mapping
- Purchase restore
- Offline grace policy
- Failure/recovery UX

## Phase 5 — Reuse
- Mercate integration
- Video Player integration
- Shared release/versioning process

## Phase 6 — Hardening
- Abuse detection
- Replay resistance
- Key rotation
- Certificate/package validation
- Automated security tests
- Operational monitoring

## Non-goals

- Making software mathematically impossible to pirate.
- Embedding master secrets in Flutter applications.
- Blocking legitimate users merely because verification temporarily fails.
