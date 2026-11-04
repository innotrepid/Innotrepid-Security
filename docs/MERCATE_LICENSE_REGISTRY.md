# Mercate licence registry and lifecycle

This phase adds a lifecycle service and a storage contract. It is not a production API and the in-memory store is strictly for tests.

## Business invariant

At most one licence record per business may have status `current`. The storage adapter must enforce this invariant transactionally (unique partial index or equivalent) and serialize mutations for the same business. Do not rely on the in-memory implementation for production concurrency.

## Lifecycle

- **Issue:** only allowed when no current licence exists for the business.
- **Renew:** creates a new signed licence ID. If the current licence has not expired, the new term begins at its existing expiry; if it has expired, the new term begins at the renewal time. The prior record becomes superseded.
- **Replace:** creates a fresh licence ID with the same expiry and policy claims by default, then supersedes the previous record. Requires an operator reason and is not allowed after expiry (use renewal instead).
- **Revoke:** marks the current record revoked, records the operator and reason, and leaves the full history intact.

Every mutation requires an actor ID and idempotency key. Replaying a completed command with the same business/key returns the original signed record rather than creating a duplicate. Each successful mutation writes an audit event.

## Important implementation constraints

- The registry stores the issued signed token so an authorized console can recover and copy it after a network interruption. Protect the database with encryption at rest and strict operator access; never log tokens.
- A production store must atomically persist the record, audit event, and idempotency result in one database transaction.
- A production store must enforce one current licence per business and uniqueness of idempotency keys within a business.
- The memory store is for deterministic unit tests only. It is not durable and must not be wired into production.
- No HTTP endpoint or operator authentication is added in this phase.
- Device allowances remain signed policy metadata; device enrolment/enforcement is separate.
- Revocation in the registry does not instantly revoke an offline token on an already disconnected device. Offline clients learn only through later online refresh or a future short-lived online status mechanism.

## Production follow-up

Choose the deployment database and operator identity provider before implementing the durable adapter and protected API. Add an append-only audit sink, KMS/HSM signing adapter, rate limiting, monitoring, backup/restore, and documented key recovery before issuing live customer licences.
