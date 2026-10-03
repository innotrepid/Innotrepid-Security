import type { Entitlement } from "./domain.js";

export interface StoredEntitlement extends Entitlement {
  appId: string;
  subjectId: string;
  productId?: string;
  purchaseTokenHash?: string;
  updatedAt: string;
}

export interface EntitlementStore {
  get(appId: string, subjectId: string, entitlementId: string): StoredEntitlement | undefined;
  put(value: StoredEntitlement): void;
  revoke(appId: string, subjectId: string, entitlementId: string): boolean;
}

export class MemoryEntitlementStore implements EntitlementStore {
  private readonly values = new Map<string, StoredEntitlement>();

  private key(appId: string, subjectId: string, entitlementId: string): string {
    return [appId, subjectId, entitlementId].join(":");
  }

  get(appId: string, subjectId: string, entitlementId: string) {
    return this.values.get(this.key(appId, subjectId, entitlementId));
  }

  put(value: StoredEntitlement): void {
    this.values.set(
      this.key(value.appId, value.subjectId, value.id),
      value,
    );
  }

  revoke(appId: string, subjectId: string, entitlementId: string): boolean {
    const key = this.key(appId, subjectId, entitlementId);
    const current = this.values.get(key);
    if (!current) return false;

    this.values.set(key, {
      ...current,
      status: "revoked",
      updatedAt: new Date().toISOString(),
    });
    return true;
  }
}
