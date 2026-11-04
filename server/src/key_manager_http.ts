import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  KeyManagerOperatorAuthenticator,
  OperatorAuthenticationError,
  hasKeyManagerPermission,
  type KeyManagerPrincipal,
} from "./operator_auth.js";
import type { MercateLicenseTerm } from "./mercate_license.js";
import {
  MercateLicenseRegistryService,
  type MercateLicenseLifecycleResult,
} from "./mercate_registry.js";

const MAX_BODY_BYTES = 32 * 1024;
const BUSINESS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface KeyManagerHttpOptions {
  authenticator: KeyManagerOperatorAuthenticator;
  registry: MercateLicenseRegistryService;
  now?: () => Date;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store, max-age=0");
  response.setHeader("pragma", "no-cache");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_too_large");
    chunks.push(part);
  }
  if (!size) throw new Error("empty_body");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_json");
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredString(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`invalid_${field}`);
  }
  return value.trim();
}

function optionalInteger(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`invalid_${field}`);
  }
  return value as number;
}

function parseBusinessId(value: unknown): string {
  const id = requiredString(value, "business_id", 64);
  if (!BUSINESS_ID_PATTERN.test(id)) throw new Error("invalid_business_id");
  return id;
}

function parseDeviceLimit(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalInteger(value, "max_devices", 1, 10_000);
}

function parseTerm(value: unknown): MercateLicenseTerm {
  const term = object(value);
  if (!term) throw new Error("invalid_term");
  if (term.kind === "weekly") return { kind: "weekly" };
  if (term.kind === "monthly") {
    const timeZone = term.timeZone === undefined
      ? "UTC"
      : requiredString(term.timeZone, "time_zone", 128);
    try { new Intl.DateTimeFormat("en", { timeZone }); } catch { throw new Error("invalid_time_zone"); }
    return { kind: "monthly", timeZone };
  }
  if (term.kind === "custom") {
    const expiresAt = requiredString(term.expiresAt, "expires_at", 64);
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(expiresAt) ||
        !Number.isFinite(new Date(expiresAt).getTime())) {
      throw new Error("invalid_expires_at");
    }
    return { kind: "custom", expiresAt };
  }
  throw new Error("invalid_term");
}

function parseBusinessCommand(body: unknown): {
  businessId: string;
  graceDays?: number;
  maxDevices?: number | null;
} {
  const input = object(body);
  if (!input) throw new Error("invalid_request_body");
  return {
    businessId: parseBusinessId(input.businessId),
    graceDays: optionalInteger(input.graceDays, "grace_days", 0, 365),
    maxDevices: parseDeviceLimit(input.maxDevices),
  };
}

function requireIdempotencyKey(request: IncomingMessage): string {
  return requiredString(request.headers["idempotency-key"], "idempotency_key", 200);
}

function publicRecord(result: MercateLicenseLifecycleResult) {
  return {
    action: result.action,
    idempotentReplay: result.idempotentReplay,
    license: {
      businessId: result.record.businessId,
      licenseId: result.record.licenseId,
      claims: result.record.claims,
      status: result.record.status,
      createdAt: result.record.createdAt,
      ...(result.record.replacedByLicenseId
        ? { replacedByLicenseId: result.record.replacedByLicenseId }
        : {}),
      ...(result.record.revokedAt ? { revokedAt: result.record.revokedAt } : {}),
      ...(result.record.revokedBy ? { revokedBy: result.record.revokedBy } : {}),
      ...(result.record.revocationReason ? { revocationReason: result.record.revocationReason } : {}),
    },
    // Only lifecycle mutation responses return the activation token.
    activationToken: result.record.token,
  };
}

function requirePermission(
  principal: KeyManagerPrincipal,
  permission: "mercate:licenses:read" | "mercate:licenses:write",
): void {
  if (!hasKeyManagerPermission(principal, permission)) {
    throw new Error("permission_denied");
  }
}

async function authenticate(
  request: IncomingMessage,
  options: KeyManagerHttpOptions,
): Promise<KeyManagerPrincipal> {
  return options.authenticator.authenticate(request.headers.authorization);
}

export function createKeyManagerHttpServer(options: KeyManagerHttpOptions): Server {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/v1/key-manager/health" && request.method === "GET") {
        json(response, 200, { status: "ok" });
        return;
      }

      const principal = await authenticate(request, options);

      if (request.method === "POST" && url.pathname === "/v1/key-manager/licenses/issue") {
        requirePermission(principal, "mercate:licenses:write");
        const body = await readJson(request);
        const input = parseBusinessCommand(body);
        const data = object(body)!;
        const result = await options.registry.issue({
          ...input,
          actorId: principal.actorId,
          idempotencyKey: requireIdempotencyKey(request),
          term: parseTerm(data.term),
          now: options.now?.(),
        });
        json(response, 201, publicRecord(result));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/key-manager/licenses/renew") {
        requirePermission(principal, "mercate:licenses:write");
        const body = await readJson(request);
        const input = parseBusinessCommand(body);
        const data = object(body)!;
        const result = await options.registry.renew({
          ...input,
          actorId: principal.actorId,
          idempotencyKey: requireIdempotencyKey(request),
          term: parseTerm(data.term),
          now: options.now?.(),
        });
        json(response, 200, publicRecord(result));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/key-manager/licenses/replace") {
        requirePermission(principal, "mercate:licenses:write");
        const body = await readJson(request);
        const input = parseBusinessCommand(body);
        const data = object(body)!;
        const result = await options.registry.replace({
          ...input,
          actorId: principal.actorId,
          idempotencyKey: requireIdempotencyKey(request),
          reason: requiredString(data.reason, "reason", 2_000),
          now: options.now?.(),
        });
        json(response, 200, publicRecord(result));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/key-manager/licenses/revoke") {
        requirePermission(principal, "mercate:licenses:write");
        const body = await readJson(request);
        const input = parseBusinessCommand(body);
        const data = object(body)!;
        const result = await options.registry.revoke({
          businessId: input.businessId,
          actorId: principal.actorId,
          idempotencyKey: requireIdempotencyKey(request),
          reason: requiredString(data.reason, "reason", 2_000),
          now: options.now?.(),
        });
        json(response, 200, publicRecord(result));
        return;
      }

      const historyMatch = url.pathname.match(/^\/v1\/key-manager\/businesses\/([^/]+)\/history$/);
      if (request.method === "GET" && historyMatch) {
        requirePermission(principal, "mercate:licenses:read");
        const businessId = parseBusinessId(decodeURIComponent(historyMatch[1]));
        const result = await options.registry.listHistory(businessId);
        json(response, 200, {
          businessId,
          licenses: result.licenses.map((record) => ({
            businessId: record.businessId,
            licenseId: record.licenseId,
            claims: record.claims,
            status: record.status,
            createdAt: record.createdAt,
            ...(record.replacedByLicenseId ? { replacedByLicenseId: record.replacedByLicenseId } : {}),
            ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
            ...(record.revokedBy ? { revokedBy: record.revokedBy } : {}),
            ...(record.revocationReason ? { revocationReason: record.revocationReason } : {}),
          })),
          auditEvents: result.auditEvents,
        });
        return;
      }

      json(response, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof OperatorAuthenticationError) {
        const status = error.code === "operator_not_allowed" ? 403 : 401;
        json(response, status, { error: error.code });
        return;
      }
      const reason = error instanceof Error ? error.message : "request_failed";
      if (reason === "permission_denied") {
        json(response, 403, { error: reason });
        return;
      }
      const clientErrors = new Set([
        "request_too_large", "empty_body", "invalid_json", "invalid_request_body",
        "invalid_business_id", "invalid_term", "invalid_time_zone", "invalid_expires_at",
        "invalid_grace_days", "invalid_max_devices", "invalid_reason", "invalid_idempotency_key",
      ]);
      const status = reason === "request_too_large" ? 413 : clientErrors.has(reason) ? 400 : 409;
      json(response, status, { error: clientErrors.has(reason) ? reason : "operation_failed" });
    }
  });
}
