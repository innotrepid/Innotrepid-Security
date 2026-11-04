import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { VerificationRequest } from "./domain.js";
import { verify, type VerificationServiceOptions } from "./service.js";

const MAX_BODY_BYTES = 64 * 1024;

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("request_too_large");
    }
    chunks.push(buffer);
  }

  if (size === 0) {
    throw new Error("empty_body");
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isVerificationRequest(value: unknown): value is VerificationRequest {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  const app = input.app;

  if (!app || typeof app !== "object") return false;
  const appRecord = app as Record<string, unknown>;

  return (
    typeof input.requestId === "string" &&
    input.requestId.length > 0 &&
    typeof appRecord.appId === "string" &&
    typeof appRecord.packageName === "string" &&
    typeof appRecord.version === "string" &&
    (appRecord.buildNumber === undefined || typeof appRecord.buildNumber === "string") &&
    (input.purchaseToken === undefined || typeof input.purchaseToken === "string") &&
    (input.integrityToken === undefined || typeof input.integrityToken === "string") &&
    (input.integrityRequestHash === undefined || typeof input.integrityRequestHash === "string")
  );
}

export interface SecurityHttpOptions {
  verification: VerificationServiceOptions;
}

export function createSecurityHttpServer(options: SecurityHttpOptions): Server {
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/v1/health") {
        writeJson(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "POST" && request.url === "/v1/verify") {
        const body = await readJson(request);

        if (!isVerificationRequest(body)) {
          writeJson(response, 400, {
            status: "denied",
            reason: "invalid_request",
          });
          return;
        }

        const result = await verify(body, options.verification);
        writeJson(response, result.status === "denied" ? 403 : 200, result);
        return;
      }

      if (request.url === "/v1/verify") {
        response.setHeader("allow", "POST");
        writeJson(response, 405, { status: "denied", reason: "method_not_allowed" });
        return;
      }

      writeJson(response, 404, { status: "denied", reason: "not_found" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "request_failed";
      const statusCode = reason === "request_too_large" ? 413 : 400;
      writeJson(response, statusCode, {
        status: "denied",
        reason,
      });
    }
  });
}
