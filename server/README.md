# Verification Server

This is the server-side authority for Innotrepid Security. Mobile clients submit purchase and integrity evidence; the server decides whether an entitlement can be granted.

## HTTP API

- `GET /v1/health` — basic health response.
- `POST /v1/verify` — validates the request contract and runs the verification service.

The verification request contains an application identity plus purchase and Play Integrity evidence. The server returns a verification status, verification ID, and—only when verified—the entitlement.

The HTTP layer has a 64 KiB request-body limit and does not log or echo purchase/integrity tokens.

## Development

The current default server deliberately uses unconfigured providers, so it cannot grant real premium access. Production wiring must supply real Google Play and Play Integrity providers.

The in-memory entitlement store is also development-only. Production needs durable storage, revocation support, audit logging, rate limiting, monitoring, and secret management.

## Security boundary

Do not put a reusable server secret in a Flutter APK. A client-held API key is not a reliable authorization boundary. The real production boundary is server-side verification of purchase evidence and Play Integrity.

## Secrets

Production credentials and signing keys must be supplied through the deployment environment or a secret manager. They must never be committed to this repository.
