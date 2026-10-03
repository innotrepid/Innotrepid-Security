# Verification Server

This directory will contain the server-side authority for Innotrepid Security.

## Responsibilities

- Authenticate and rate-limit requests.
- Validate application identity.
- Verify Google Play purchase evidence.
- Verify Play Integrity evidence.
- Resolve entitlement state.
- Issue short-lived or bounded entitlement responses.
- Support revocation.
- Record security/audit events.

## Secrets

Production credentials and signing keys must be supplied through the deployment environment or a secret manager. They must never be committed to this repository.

## Current status

Contract and architecture only. Provider-specific verification code will be added after the API contract is finalized.
