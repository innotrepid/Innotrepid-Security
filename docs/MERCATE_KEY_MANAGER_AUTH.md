# Mercate Key Manager — operator authentication foundation

This phase establishes the authentication and authorization primitive for the internal-only Key Manager. It does not expose licence-management HTTP routes or constitute a deployed operator application.

## Sign-in provider

Google OpenID Connect is the initial identity provider. The server verifies Google ID tokens using Google's maintained authentication library. Verification checks the token signature, issuer, expiry and configured OAuth client audience. The Key Manager then requires a verified email address and a matching server-side operator allowlist entry.

The authenticated actor ID is derived from Google's stable `sub` claim (`google:<sub>`). It is never accepted from a browser request body. Role assignments are server configuration, not user-controlled Google profile claims.

## Roles and permissions

- `administrator`: read licences, issue/renew/replace/revoke licences, manage operators.
- `licensing_operator`: read and write licence operations.
- `read_only`: inspect licences and history only.

Permission identifiers:

- `mercate:licenses:read`
- `mercate:licenses:write`
- `mercate:operators:manage`

The default-deny allowlist is deliberately explicit. A valid Google account is not automatically an authorized operator.

## Runtime configuration contract

- `KEY_MANAGER_GOOGLE_CLIENT_ID`: OAuth 2.0 Web application client ID; used as the required token audience.
- `KEY_MANAGER_OPERATORS_JSON`: JSON array of objects containing an exact operator `email` and `roles` array. Example:

```json
[
  { "email": "owner@example.com", "roles": ["administrator"] },
  { "email": "staff@example.com", "roles": ["licensing_operator"] }
]
```

Supply configuration through the deployment's secret/configuration manager. Do not commit real operator email addresses, client secrets, access tokens or ID tokens. This initial phase does not need a Google client secret because it verifies ID tokens presented by the client; the eventual browser application must use Authorization Code flow with PKCE and must never embed a client secret.

## Security behavior

- Missing, malformed, expired, wrong-audience, invalid-signature and wrong-issuer tokens are rejected.
- Unverified email addresses and non-allowlisted accounts are rejected.
- Invalid verifier errors are normalized; raw tokens and verifier details are not logged.
- The authenticated Google subject is the actor identity for audit events.
- Authorization is based on server-owned roles and explicit permissions.

## Hosting and cost

Google OIDC sign-in does not require a paid Google Workspace subscription. A Google Cloud OAuth client can be configured for a personal Google account. Hosting the API, web UI and PostgreSQL database is a separate cost decision; this code does not provision or require a paid host. Do not expose the issuer until the API, durable database, TLS, rate limits, key custody and production configuration are ready.

## Scope boundary

No issuance, renewal, replacement, revocation or history endpoint is added in this phase. Existing Mercate licence verification and customer data paths are unchanged. The authenticator is a reusable server-side boundary to be applied to the future Key Manager routes.
