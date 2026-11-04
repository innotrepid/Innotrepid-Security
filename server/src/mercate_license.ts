import { randomUUID, createPrivateKey, sign } from "node:crypto";

export interface MercateLicenseClaims {
  schemaVersion: 1;
  product: "mercate";
  businessId: string;
  licenseId: string;
  issuedAt: string;
  expiresAt: string;
  graceDays: number;
  maxDevices: number | null;
}

export type MercateLicenseTerm =
  | { kind: "weekly" }
  | { kind: "monthly"; timeZone?: string }
  | { kind: "custom"; expiresAt: string };

export interface MercateLicenseIssueInput {
  businessId: string;
  issuedAt?: Date;
  term: MercateLicenseTerm;
  graceDays?: number;
  maxDevices?: number | null;
  licenseId?: string;
}

export interface MercateLicenseSigner {
  sign(payload: Uint8Array): Promise<Uint8Array>;
}

/**
 * Node Ed25519 adapter. Supply PEM material from a deployment secret manager;
 * never commit the PEM or expose it to Mercate clients.
 */
export class PemEd25519MercateLicenseSigner implements MercateLicenseSigner {
  private readonly privateKey;

  constructor(privateKeyPem: string) {
    if (!privateKeyPem.trim()) throw new Error("A signing key is required.");
    this.privateKey = createPrivateKey(privateKeyPem);
    if (this.privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error("Mercate v1 requires an Ed25519 private key.");
    }
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    return sign(null, Buffer.from(payload), this.privateKey);
  }
}

function assertIssueInput(input: MercateLicenseIssueInput): void {
  if (!input.businessId.trim()) throw new Error("businessId is required.");
  if (input.graceDays !== undefined &&
      (!Number.isSafeInteger(input.graceDays) || input.graceDays < 0)) {
    throw new Error("graceDays must be a non-negative integer.");
  }
  if (input.maxDevices !== undefined && input.maxDevices !== null &&
      (!Number.isSafeInteger(input.maxDevices) || input.maxDevices < 1)) {
    throw new Error("maxDevices must be a positive integer or null.");
  }
}

function zonedParts(instant: Date, timeZone: string): {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number; millisecond: number;
} {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute),
    second: Number(parts.second), millisecond: instant.getUTCMilliseconds(),
  };
}

/** Resolve a wall-clock time in an IANA zone, rejecting nonexistent DST times. */
function localTimeToInstant(
  local: ReturnType<typeof zonedParts>,
  timeZone: string,
): Date {
  const targetUtcLike = Date.UTC(
    local.year, local.month - 1, local.day,
    local.hour, local.minute, local.second, local.millisecond,
  );
  let guess = targetUtcLike;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = zonedParts(new Date(guess), timeZone);
    const actualUtcLike = Date.UTC(
      actual.year, actual.month - 1, actual.day,
      actual.hour, actual.minute, actual.second, actual.millisecond,
    );
    const correction = targetUtcLike - actualUtcLike;
    if (correction === 0) return new Date(guess);
    guess += correction;
  }
  throw new Error("The monthly expiry falls in a nonexistent local time.");
}

function addCalendarMonth(issuedAt: Date, timeZone: string): Date {
  // Validate the IANA zone before any date calculation.
  new Intl.DateTimeFormat("en", { timeZone });
  const local = zonedParts(issuedAt, timeZone);
  const targetMonthIndex = local.year * 12 + (local.month - 1) + 1;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return localTimeToInstant({
    ...local,
    year: targetYear,
    month: targetMonth,
    day: Math.min(local.day, lastDay),
  }, timeZone);
}

export function calculateMercateExpiry(
  issuedAt: Date,
  term: MercateLicenseTerm,
): Date {
  if (!Number.isFinite(issuedAt.getTime())) throw new Error("issuedAt is invalid.");
  let expiresAt: Date;
  switch (term.kind) {
    case "weekly":
      expiresAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      expiresAt = addCalendarMonth(issuedAt, term.timeZone ?? "UTC");
      break;
    case "custom": {
      if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(term.expiresAt)) {
        throw new Error("Custom expiry must include an explicit UTC offset.");
      }
      expiresAt = new Date(term.expiresAt);
      break;
    }
  }
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error("expiresAt is invalid.");
  }
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    throw new Error("expiresAt must be later than issuedAt.");
  }
  return expiresAt;
}

/** Emits the exact v1 Mercate wire format: base64url(payload).base64url(signature). */
export async function issueMercateLicense(
  input: MercateLicenseIssueInput,
  signer: MercateLicenseSigner,
): Promise<{ claims: MercateLicenseClaims; token: string }> {
  assertIssueInput(input);
  const issuedAt = input.issuedAt ?? new Date();
  const expiresAt = calculateMercateExpiry(issuedAt, input.term);
  const claims: MercateLicenseClaims = {
    schemaVersion: 1,
    product: "mercate",
    businessId: input.businessId.trim(),
    licenseId: input.licenseId ?? randomUUID(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    graceDays: input.graceDays ?? 0,
    maxDevices: input.maxDevices ?? null,
  };
  if (!claims.licenseId.trim()) throw new Error("licenseId is required.");
  const payload = Buffer.from(JSON.stringify(claims), "utf8");
  const signature = await signer.sign(payload);
  if (signature.length !== 64) throw new Error("Ed25519 signatures must be 64 bytes.");
  return {
    claims,
    token: payload.toString("base64url") + "." + Buffer.from(signature).toString("base64url"),
  };
}
