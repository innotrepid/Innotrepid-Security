import { randomUUID } from "node:crypto";
import {
  calculateMercateExpiry,
  issueMercateLicense,
  type MercateLicenseClaims,
  type MercateLicenseSigner,
  type MercateLicenseTerm,
} from "./mercate_license.js";

export type MercateLicenseRecordStatus = "current" | "superseded" | "revoked";

export interface MercateLicenseRecord {
  businessId: string;
  licenseId: string;
  claims: MercateLicenseClaims;
  token: string;
  status: MercateLicenseRecordStatus;
  createdAt: string;
  replacedByLicenseId?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}

export interface MercateLicenseAuditEvent {
  eventId: string;
  businessId: string;
  licenseId: string;
  action: "issued" | "renewed" | "replaced" | "revoked";
  actorId: string;
  occurredAt: string;
  idempotencyKey: string;
  previousLicenseId?: string;
}

export interface MercateLicenseTransaction {
  getCurrent(businessId: string): Promise<MercateLicenseRecord | undefined>;
  getLicense(businessId: string, licenseId: string): Promise<MercateLicenseRecord | undefined>;
  getIdempotentResult(businessId: string, key: string): Promise<{
    record: MercateLicenseRecord;
    action: MercateLicenseAuditEvent["action"];
  } | undefined>;
  listHistory(businessId: string): Promise<MercateLicenseRecord[]>;
  listAuditEvents(businessId: string): Promise<MercateLicenseAuditEvent[]>;
  putLicense(record: MercateLicenseRecord): Promise<void>;
  addAuditEvent(event: MercateLicenseAuditEvent): Promise<void>;
}

export interface MercateLicenseRegistryStore {
  /**
   * Must provide an atomic, serialized transaction for this business.
   * Production adapters must implement this with a database transaction and
   * a per-business row/advisory lock; the memory implementation is test-only.
   */
  transact<T>(
    businessId: string,
    operation: (transaction: MercateLicenseTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface IssueMercateLicenseCommand {
  businessId: string;
  actorId: string;
  idempotencyKey: string;
  term: MercateLicenseTerm;
  graceDays?: number;
  maxDevices?: number | null;
  now?: Date;
}

export interface RenewMercateLicenseCommand extends IssueMercateLicenseCommand {}

export interface ReplaceMercateLicenseCommand {
  businessId: string;
  actorId: string;
  idempotencyKey: string;
  reason: string;
  graceDays?: number;
  maxDevices?: number | null;
  now?: Date;
}

export interface RevokeMercateLicenseCommand {
  businessId: string;
  actorId: string;
  idempotencyKey: string;
  reason: string;
  now?: Date;
}

export interface MercateLicenseLifecycleResult {
  record: MercateLicenseRecord;
  action: MercateLicenseAuditEvent["action"];
  idempotentReplay: boolean;
}

function requireCommandIdentity(
  businessId: string,
  actorId: string,
  idempotencyKey: string,
): void {
  if (!businessId.trim()) throw new Error("businessId is required.");
  if (!actorId.trim()) throw new Error("actorId is required.");
  if (!idempotencyKey.trim()) throw new Error("idempotencyKey is required.");
}

function requireNow(now: Date | undefined): Date {
  const value = now ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new Error("now is invalid.");
  return value;
}

export class MercateLicenseRegistryService {
  constructor(
    private readonly store: MercateLicenseRegistryStore,
    private readonly signer: MercateLicenseSigner,
  ) {}

  async listHistory(businessId: string): Promise<{
    licenses: MercateLicenseRecord[];
    auditEvents: MercateLicenseAuditEvent[];
  }> {
    if (!businessId.trim()) throw new Error("businessId is required.");
    return this.store.transact(businessId, async (tx) => ({
      licenses: await tx.listHistory(businessId),
      auditEvents: await tx.listAuditEvents(businessId),
    }));
  }

  issue(command: IssueMercateLicenseCommand): Promise<MercateLicenseLifecycleResult> {
    requireCommandIdentity(command.businessId, command.actorId, command.idempotencyKey);
    const now = requireNow(command.now);
    return this.store.transact(command.businessId, async (tx) => {
      const replay = await tx.getIdempotentResult(command.businessId, command.idempotencyKey);
      if (replay) return { ...replay, idempotentReplay: true };
      if (await tx.getCurrent(command.businessId)) {
        throw new Error("business_already_has_current_license");
      }
      return this.createRecord(tx, {
        businessId: command.businessId,
        actorId: command.actorId,
        idempotencyKey: command.idempotencyKey,
        action: "issued",
        issuedAt: now,
        term: command.term,
        graceDays: command.graceDays ?? 0,
        maxDevices: command.maxDevices ?? null,
      });
    });
  }

  renew(command: RenewMercateLicenseCommand): Promise<MercateLicenseLifecycleResult> {
    requireCommandIdentity(command.businessId, command.actorId, command.idempotencyKey);
    const now = requireNow(command.now);
    return this.store.transact(command.businessId, async (tx) => {
      const replay = await tx.getIdempotentResult(command.businessId, command.idempotencyKey);
      if (replay) return { ...replay, idempotentReplay: true };
      const current = await tx.getCurrent(command.businessId);
      if (!current) throw new Error("current_license_not_found");
      const anchor = new Date(Math.max(
        now.getTime(),
        new Date(current.claims.expiresAt).getTime(),
      ));
      const expiresAt = calculateMercateExpiry(anchor, command.term);
      return this.createRecord(tx, {
        businessId: command.businessId,
        actorId: command.actorId,
        idempotencyKey: command.idempotencyKey,
        action: "renewed",
        issuedAt: now,
        term: { kind: "custom", expiresAt: expiresAt.toISOString() },
        graceDays: command.graceDays ?? current.claims.graceDays,
        maxDevices: command.maxDevices === undefined
          ? current.claims.maxDevices
          : command.maxDevices,
        previous: current,
      });
    });
  }

  replace(command: ReplaceMercateLicenseCommand): Promise<MercateLicenseLifecycleResult> {
    requireCommandIdentity(command.businessId, command.actorId, command.idempotencyKey);
    if (!command.reason.trim()) throw new Error("replacement_reason_required");
    const now = requireNow(command.now);
    return this.store.transact(command.businessId, async (tx) => {
      const replay = await tx.getIdempotentResult(command.businessId, command.idempotencyKey);
      if (replay) return { ...replay, idempotentReplay: true };
      const current = await tx.getCurrent(command.businessId);
      if (!current) throw new Error("current_license_not_found");
      const expiresAt = new Date(current.claims.expiresAt);
      if (expiresAt.getTime() <= now.getTime()) {
        throw new Error("expired_license_requires_renewal_not_replacement");
      }
      return this.createRecord(tx, {
        businessId: command.businessId,
        actorId: command.actorId,
        idempotencyKey: command.idempotencyKey,
        action: "replaced",
        issuedAt: now,
        term: { kind: "custom", expiresAt: expiresAt.toISOString() },
        graceDays: command.graceDays ?? current.claims.graceDays,
        maxDevices: command.maxDevices === undefined
          ? current.claims.maxDevices
          : command.maxDevices,
        previous: current,
      });
    });
  }

  revoke(command: RevokeMercateLicenseCommand): Promise<MercateLicenseLifecycleResult> {
    requireCommandIdentity(command.businessId, command.actorId, command.idempotencyKey);
    if (!command.reason.trim()) throw new Error("revocation_reason_required");
    const now = requireNow(command.now);
    return this.store.transact(command.businessId, async (tx) => {
      const replay = await tx.getIdempotentResult(command.businessId, command.idempotencyKey);
      if (replay) return { ...replay, idempotentReplay: true };
      const current = await tx.getCurrent(command.businessId);
      if (!current) throw new Error("current_license_not_found");
      const revoked: MercateLicenseRecord = {
        ...current,
        status: "revoked",
        revokedAt: now.toISOString(),
        revokedBy: command.actorId,
        revocationReason: command.reason.trim(),
      };
      await tx.putLicense(revoked);
      const event: MercateLicenseAuditEvent = {
        eventId: randomUUID(),
        businessId: command.businessId,
        licenseId: current.licenseId,
        action: "revoked",
        actorId: command.actorId,
        occurredAt: now.toISOString(),
        idempotencyKey: command.idempotencyKey,
      };
      await tx.addAuditEvent(event);
      return { record: revoked, action: "revoked", idempotentReplay: false };
    });
  }

  private async createRecord(
    tx: MercateLicenseTransaction,
    input: {
      businessId: string;
      actorId: string;
      idempotencyKey: string;
      action: MercateLicenseAuditEvent["action"];
      issuedAt: Date;
      term: MercateLicenseTerm;
      graceDays: number;
      maxDevices: number | null;
      previous?: MercateLicenseRecord;
    },
  ): Promise<MercateLicenseLifecycleResult> {
    const issued = issueMercateLicense({
      businessId: input.businessId,
      issuedAt: input.issuedAt,
      term: input.term,
      graceDays: input.graceDays,
      maxDevices: input.maxDevices,
    }, this.signer);
    const record: MercateLicenseRecord = {
      businessId: input.businessId,
      licenseId: issued.claims.licenseId,
      claims: issued.claims,
      token: issued.token,
      status: "current",
      createdAt: input.issuedAt.toISOString(),
    };
    if (input.previous) {
      await tx.putLicense({
        ...input.previous,
        status: "superseded",
        replacedByLicenseId: record.licenseId,
      });
    }
    await tx.putLicense(record);
    await tx.addAuditEvent({
      eventId: randomUUID(),
      businessId: input.businessId,
      licenseId: record.licenseId,
      action: input.action,
      actorId: input.actorId,
      occurredAt: input.issuedAt.toISOString(),
      idempotencyKey: input.idempotencyKey,
      ...(input.previous ? { previousLicenseId: input.previous.licenseId } : {}),
    });
    return { record, action: input.action, idempotentReplay: false };
  }
}

/**
 * Test-only in-memory store. Do not wire this into a production HTTP service.
 */
export class MemoryMercateLicenseRegistryStore implements MercateLicenseRegistryStore {
  private readonly licenses = new Map<string, MercateLicenseRecord>();
  private readonly audits: MercateLicenseAuditEvent[] = [];
  private readonly idempotency = new Map<string, {
    record: MercateLicenseRecord;
    action: MercateLicenseAuditEvent["action"];
  }>();
  private readonly queues = new Map<string, Promise<void>>();

  async transact<T>(
    businessId: string,
    operation: (transaction: MercateLicenseTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(businessId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    this.queues.set(businessId, queued);
    await previous;
    try {
      const transaction: MercateLicenseTransaction = {
        getCurrent: async (id) => this.findCurrent(id),
        getLicense: async (id, licenseId) => this.licenses.get(this.licenseKey(id, licenseId)),
        getIdempotentResult: async (id, key) => this.idempotency.get(this.idempotencyKey(id, key)),
        listHistory: async (id) => [...this.licenses.values()]
          .filter((record) => record.businessId === id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        listAuditEvents: async (id) => this.audits
          .filter((event) => event.businessId === id)
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
        putLicense: async (record) => {
          this.licenses.set(this.licenseKey(record.businessId, record.licenseId), record);
        },
        addAuditEvent: async (event) => {
          this.audits.push(event);
          const record = this.licenses.get(this.licenseKey(event.businessId, event.licenseId));
          if (record) {
            this.idempotency.set(this.idempotencyKey(event.businessId, event.idempotencyKey), {
              record,
              action: event.action,
            });
          }
        },
      };
      return await operation(transaction);
    } finally {
      release();
      if (this.queues.get(businessId) === queued) this.queues.delete(businessId);
    }
  }

  listHistory(businessId: string): MercateLicenseRecord[] {
    return [...this.licenses.values()]
      .filter((record) => record.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listAuditEvents(businessId: string): MercateLicenseAuditEvent[] {
    return this.audits
      .filter((event) => event.businessId === businessId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }
  private findCurrent(businessId: string): MercateLicenseRecord | undefined {
    return [...this.licenses.values()].find(
      (record) => record.businessId === businessId && record.status === "current",
    );
  }

  private licenseKey(businessId: string, licenseId: string): string {
    return JSON.stringify([businessId, licenseId]);
  }

  private idempotencyKey(businessId: string, key: string): string {
    return JSON.stringify([businessId, key]);
  }
}
