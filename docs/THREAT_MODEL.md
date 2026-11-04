# Threat Model

## Assets

- Premium entitlements
- Purchase tokens
- Integrity evidence
- Server signing keys
- Application identities
- User entitlement state

## Threats

### Modified APK

An attacker changes client code to bypass a local premium check.

Mitigation: premium authorization is resolved independently by the backend.

### Forged entitlement

An attacker creates local state claiming premium access.

Mitigation: client-generated entitlement state is never trusted as proof.

### Purchase-token replay

A valid purchase token is reused or presented against an unrelated application.

Mitigation: server-side verification, application/product binding, replay controls, and entitlement state tracking.

### Integrity-token abuse

A token is copied or presented outside its intended context.

Mitigation: verify the token server-side and bind accepted evidence to the registered application and request context where supported.

### Credential extraction

Secrets embedded in an APK are recovered.

Mitigation: no master authorization secrets or backend credentials are shipped in the client.

### Server compromise

The verification service or signing material is compromised.

Mitigation: least-privilege credentials, key rotation, audit logging, rate limiting, secret-manager storage, and operational monitoring.

## Design objective

Client modification should not be sufficient to obtain a server-authorized premium entitlement.
