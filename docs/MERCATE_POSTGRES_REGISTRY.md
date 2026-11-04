# PostgreSQL registry adapter

The Mercate lifecycle service supports asynchronous storage transactions and includes a PostgreSQL adapter.

## Setup
1. Provision a managed PostgreSQL 13+ database with TLS required.
2. Apply `server/migrations/001_mercate_license_registry.sql`.
3. Create a least-privilege database role limited to the Mercate registry tables.
4. Construct a PostgreSQL pool (for example, using the `pg` driver) in the deployment bootstrap and inject it into `PostgresMercateLicenseRegistryStore`.
5. Configure encrypted backups, point-in-time recovery, monitoring and credential rotation.

The adapter accepts a structural pool interface, so the server package does not hard-code a cloud provider or expose connection credentials in application code.

## Transaction guarantees
- Each operation runs in a database transaction.
- A PostgreSQL transaction-scoped advisory lock serializes changes for a business across service instances.
- A partial unique index independently enforces no more than one `current` licence per business.
- The audit table has a unique `(business_id, idempotency_key)` constraint.
- The signed result snapshot is stored atomically with the licence and audit event for reliable retries.
- Failed operations roll back and release the connection.

## Data protection
The signed token is stored so an authorized operator can recover and copy it after a lost response. Treat it as sensitive operational data: use encrypted storage and backups, restrict database roles, never log it, and do not expose it in audit text.

## Not production-enabled yet
No HTTP endpoint is wired to this store. Deployment still needs authenticated operator identity, role-based authorization, CSRF/origin protections for browser sessions, rate limiting, audit export/retention, managed Ed25519 key custody, alerting and recovery drills. The in-memory store remains test-only.
