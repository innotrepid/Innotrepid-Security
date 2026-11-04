# Mercate Key Manager API — authenticated lifecycle endpoints

This module is a separately mountable HTTP server. It is not automatically exposed by the general Innotrepid Security server. Production bootstrap must explicitly provide a configured Google OIDC authenticator, a durable PostgreSQL registry store, and a protected Ed25519 signing key.

## Routes

All routes are under `/v1/key-manager`. Except the health route, all require a Google ID token in `Authorization: Bearer <id-token>`. The authenticated Google subject supplies the audit actor ID; client-supplied actor IDs are ignored.

- `GET /health`: liveness only; contains no sensitive state.
- `POST /licenses/issue`: issue when the business has no current licence.
- `POST /licenses/renew`: renew the current licence.
- `POST /licenses/replace`: replace an unexpired current licence; requires a reason.
- `POST /licenses/revoke`: revoke the current licence; requires a reason.
- `GET /businesses/:businessId/history`: read licence records and audit events.

Writes require `mercate:licenses:write`; history requires `mercate:licenses:read`. A valid Google identity not present in the server-side allowlist is denied. The route module does not expose operator-management endpoints.

## Request conventions

Every write requires an `Idempotency-Key` header. Issue and renewal bodies include `businessId`, `term` and optional `graceDays` and `maxDevices`. Terms are `{ "kind": "weekly" }`, `{ "kind": "monthly", "timeZone": "Africa/Nairobi" }`, or `{ "kind": "custom", "expiresAt": "2027-01-31T23:59:00+03:00" }`. Monthly means a calendar month in the supplied IANA time zone. Device limit may be null for unlimited. Grace days are bounded to 0–365 and device count to 1–10,000.

Replacement and revocation require a non-empty `reason`. The business ID must be a UUID, matching Mercate's permanent business identity.

Mutation responses include the signed activation token so the authorized operator can deliver it to the customer. History responses deliberately omit stored activation tokens. All responses are marked `no-store`.

## Production boundary

- Mount this server only behind HTTPS and a trusted reverse proxy.
- Configure a strict origin allowlist in the browser-facing deployment; this low-level module does not enable CORS.
- Add deployment-level rate limiting and request tracing that never logs authorization headers, request tokens, or activation tokens.
- Use a managed PostgreSQL service and run migration `001_mercate_license_registry.sql`.
- Inject a production PostgreSQL pool and Ed25519 signer from secret-managed configuration. Never commit signing material.
- Keep the issuer API private; do not make it a public unauthenticated endpoint.
- This module does not provision hosting, database infrastructure, Google OAuth clients or secrets.
- The in-memory registry is test-only and must not be used for production issuance.
- Existing Mercate client activation and offline verification behavior are unchanged.


## Explicit server composition factory

`server/src/mercate_key_manager_server.ts` now provides
`createMercateKeyManagerServer(options)`. It composes Google OIDC
verification, the server-owned operator allowlist, the PostgreSQL registry
adapter and an injected Ed25519 signer into the Key Manager HTTP server.

The factory deliberately does not call `listen()`, mount routes into the
general-purpose server, read secrets from source-controlled config, or create
an in-memory fallback. The host application owns the database pool lifecycle
and must place this server behind a trusted HTTPS reverse proxy with strict
routing, rate limiting and safe logging.

The signer is injected through the `MercateLicenseSigner` interface. A PEM
helper exists for a private key delivered by a deployment secret manager, but
it is explicitly a transitional adapter, not managed HSM/KMS custody. Do not
use it for real customer issuance until signing-key storage, access controls,
rotation and recovery are approved.

This composition factory is a wiring milestone only. It does not mean the API
is deployed or ready to issue production licences.
