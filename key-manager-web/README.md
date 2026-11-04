# Mercate Key Manager web console

A small, separately deployable static operator UI for the authenticated Key Manager API. It is an internal tool, not part of the Mercate customer app.

## Current scope

- Google OpenID Connect Authorization Code flow with PKCE (S256).
- The browser keeps the ID token in memory only; it is not written to local storage.
- The API independently verifies the Google token and checks the server-side operator allowlist and role permissions.
- Look up licence history by permanent business UUID.
- Issue and renew weekly, calendar-monthly (Africa/Nairobi), or custom-expiry licences.
- Configure grace days and signed device allowance.
- Replace and revoke with mandatory audit reason.
- Show and copy a newly issued activation token once. History never returns stored tokens.

## Local configuration

Edit `config.js` for local testing:

- `googleClientId`: OAuth 2.0 Web application client ID.
- `apiBaseUrl`: defaults to `/v1/key-manager`.
- `redirectUri`: must exactly match an authorized redirect URI in the Google OAuth client.

Serve this directory over localhost or HTTPS. Do not open `index.html` as a `file://` URL. Register the local redirect URI in Google Cloud Console.

The API must be reachable at the configured base URL. Prefer a same-origin reverse proxy that forwards `/v1/key-manager` to the API; the API module intentionally does not enable CORS. Google OAuth does not require a paid Workspace account.

## Security and deployment boundary

This frontend is not a security boundary. The server must continue to verify token signature, issuer, expiry, audience, allowlist and role permissions for every request. The frontend's decoded ID-token claims are used only for display and nonce consistency; they do not authorize API access.

Before production use, the API still needs:
- a production bootstrap with the Google authenticator, durable PostgreSQL store and protected Ed25519 signer;
- managed signing-key custody, rotation and recovery;
- HTTPS, strict origin policy/reverse proxy, rate limiting and safe request tracing;
- live PostgreSQL integration tests and end-to-end tests against the Dart licence verifier.

Do not use the in-memory registry or a development PEM key for real customer issuance. Never commit real OAuth configuration, operator allowlists, credentials, signing keys or customer activation tokens. This UI does not change Mercate's offline verification, customer records, backups or data-retention behavior.

## Run a static preview

Any static file server can serve this directory, for example:

```sh
python -m http.server 4173 --directory key-manager-web
```

Then open `http://localhost:4173`. Configure the matching Google redirect URI before testing sign-in.
