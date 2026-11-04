# Entitlement Contract

An entitlement represents server-authorized access to a premium capability.

## Minimum fields

- id
- status
- expiresAt
- policyVersion

## Statuses

- active — currently authorized
- expired — entitlement reached its expiry
- revoked — explicitly withdrawn
- unavailable — verification could not establish access
- unknown — no trusted entitlement has been established

## Important rule

The Flutter client may consume an entitlement but must not manufacture one as proof of purchase.

## Verification request

The planned request contains app identity, purchase evidence, and integrity evidence. Purchase and integrity evidence are treated as untrusted input until verified by the backend.

## Offline policy

Offline use is supported through a bounded, explicitly configured grace period. The grace period is a product/security policy, not an unlimited local license.
