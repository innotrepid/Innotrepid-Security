-- Mercate licence registry schema (PostgreSQL 13+).
CREATE TABLE IF NOT EXISTS mercate_licenses (
  business_id TEXT NOT NULL,
  license_id TEXT NOT NULL,
  claims JSONB NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('current', 'superseded', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL,
  replaced_by_license_id TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  revocation_reason TEXT,
  PRIMARY KEY (business_id, license_id),
  CHECK ((status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL) OR status <> 'revoked')
);
CREATE UNIQUE INDEX IF NOT EXISTS mercate_one_current_license_per_business
  ON mercate_licenses (business_id) WHERE status = 'current';
CREATE TABLE IF NOT EXISTS mercate_license_audit (
  event_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  license_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('issued', 'renewed', 'replaced', 'revoked')),
  actor_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL,
  previous_license_id TEXT,
  result_snapshot JSONB NOT NULL,
  CONSTRAINT mercate_audit_license_fk FOREIGN KEY (business_id, license_id)
    REFERENCES mercate_licenses (business_id, license_id),
  CONSTRAINT mercate_audit_idempotency_unique UNIQUE (business_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS mercate_license_audit_business_time
  ON mercate_license_audit (business_id, occurred_at DESC);
