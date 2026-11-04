import type {
  MercateLicenseRecord,
  MercateLicenseRegistryStore,
  MercateLicenseTransaction,
  MercateLicenseAuditEvent as AuditEvent,
} from "./mercate_registry.js";

export interface SqlQueryResult<Row> { rows: Row[]; }
export interface SqlExecutor {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
}
export interface SqlTransactionClient extends SqlExecutor { release(): void; }
export interface SqlConnectionPool extends SqlExecutor { connect(): Promise<SqlTransactionClient>; }

interface LicenseRow {
  business_id: string; license_id: string; claims: MercateLicenseRecord["claims"];
  token: string; status: MercateLicenseRecord["status"]; created_at: Date | string;
  replaced_by_license_id: string | null; revoked_at: Date | string | null;
  revoked_by: string | null; revocation_reason: string | null;
}
interface IdempotencyRow {
  action: AuditEvent["action"];
  result_snapshot: MercateLicenseRecord;
}
interface AuditRow {
  event_id: string; business_id: string; license_id: string;
  action: AuditEvent["action"]; actor_id: string;
  occurred_at: Date | string; idempotency_key: string;
  previous_license_id: string | null;
}
function toIso(value: Date | string | null): string | undefined {
  if (value === null) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function mapRecord(row: LicenseRow): MercateLicenseRecord {
  return {
    businessId: row.business_id, licenseId: row.license_id, claims: row.claims,
    token: row.token, status: row.status, createdAt: toIso(row.created_at)!,
    ...(row.replaced_by_license_id ? { replacedByLicenseId: row.replaced_by_license_id } : {}),
    ...(row.revoked_at ? { revokedAt: toIso(row.revoked_at) } : {}),
    ...(row.revoked_by ? { revokedBy: row.revoked_by } : {}),
    ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {}),
  };
}

/** PostgreSQL-backed production storage adapter. */
export class PostgresMercateLicenseRegistryStore implements MercateLicenseRegistryStore {
  constructor(private readonly pool: SqlConnectionPool) {}

  async transact<T>(
    businessId: string,
    operation: (transaction: MercateLicenseTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [businessId]);
      const transaction: MercateLicenseTransaction = {
        getCurrent: async (id) => this.getOne(
          client, "SELECT * FROM mercate_licenses WHERE business_id = $1 AND status = 'current' LIMIT 1", [id]),
        getLicense: async (id, licenseId) => this.getOne(
          client, "SELECT * FROM mercate_licenses WHERE business_id = $1 AND license_id = $2", [id, licenseId]),
        getIdempotentResult: async (id, key) => {
          const result = await client.query<IdempotencyRow>(
            "SELECT action, result_snapshot FROM mercate_license_audit WHERE business_id = $1 AND idempotency_key = $2",
            [id, key],
          );
          const row = result.rows[0];
          return row ? { action: row.action, record: row.result_snapshot } : undefined;
        },
        listHistory: async (id) => {
          const result = await client.query<LicenseRow>(
            "SELECT * FROM mercate_licenses WHERE business_id = $1 ORDER BY created_at ASC, license_id ASC",
            [id],
          );
          return result.rows.map(mapRecord);
        },
        listAuditEvents: async (id) => {
          const result = await client.query<AuditRow>(
            "SELECT event_id, business_id, license_id, action, actor_id, occurred_at, idempotency_key, previous_license_id FROM mercate_license_audit WHERE business_id = $1 ORDER BY occurred_at ASC, event_id ASC",
            [id],
          );
          return result.rows.map((row) => ({
            eventId: row.event_id, businessId: row.business_id,
            licenseId: row.license_id, action: row.action, actorId: row.actor_id,
            occurredAt: toIso(row.occurred_at)!,
            idempotencyKey: row.idempotency_key,
            ...(row.previous_license_id ? { previousLicenseId: row.previous_license_id } : {}),
          }));
        },
        putLicense: async (record) => {
          await client.query(
            `INSERT INTO mercate_licenses (
              business_id, license_id, claims, token, status, created_at,
              replaced_by_license_id, revoked_at, revoked_by, revocation_reason
            ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (business_id, license_id) DO UPDATE SET
              claims = EXCLUDED.claims, token = EXCLUDED.token, status = EXCLUDED.status,
              replaced_by_license_id = EXCLUDED.replaced_by_license_id,
              revoked_at = EXCLUDED.revoked_at, revoked_by = EXCLUDED.revoked_by,
              revocation_reason = EXCLUDED.revocation_reason`,
            [
              record.businessId, record.licenseId, JSON.stringify(record.claims), record.token,
              record.status, record.createdAt, record.replacedByLicenseId ?? null,
              record.revokedAt ?? null, record.revokedBy ?? null, record.revocationReason ?? null,
            ],
          );
        },
        addAuditEvent: async (event) => {
          const record = await this.getOne(
            client, "SELECT * FROM mercate_licenses WHERE business_id = $1 AND license_id = $2",
            [event.businessId, event.licenseId],
          );
          if (!record) throw new Error("audit_license_record_not_found");
          await client.query(
            `INSERT INTO mercate_license_audit (
              event_id, business_id, license_id, action, actor_id, occurred_at,
              idempotency_key, previous_license_id, result_snapshot
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
            [
              event.eventId, event.businessId, event.licenseId, event.action, event.actorId,
              event.occurredAt, event.idempotencyKey, event.previousLicenseId ?? null,
              JSON.stringify(record),
            ],
          );
        },
      };
      const result = await operation(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }

  private async getOne(
    client: SqlExecutor,
    sql: string,
    values: readonly unknown[],
  ): Promise<MercateLicenseRecord | undefined> {
    const result = await client.query<LicenseRow>(sql, values);
    return result.rows[0] ? mapRecord(result.rows[0]) : undefined;
  }
}
