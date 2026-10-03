import type { Entitlement } from "./domain.js";
import type { EntitlementStore } from "./store.js";

export function resolveEntitlement(
  store: EntitlementStore,
  appId: string,
  subjectId: string,
  entitlementId: string,
): Entitlement | undefined {
  const stored = store.get(appId, subjectId, entitlementId);
  if (!stored) return undefined;
  if (stored.status === "revoked") return stored;
  if (stored.expiresAt && new Date(stored.expiresAt) <= new Date()) {
    return { ...stored, status: "expired" };
  }
  return stored;
}
