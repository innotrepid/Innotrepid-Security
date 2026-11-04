import { createPrivateKey, sign } from "node:crypto";

import type { Entitlement } from "./domain.js";

export interface EntitlementTokenSigner {
  sign(input: {
    appId: string;
    subjectId: string;
    productId: string;
    entitlement: Entitlement;
    verificationId: string;
  }): string;
}

export interface EntitlementTokenSignerOptions {
  privateKeyPem: string;
  keyId: string;
  issuer?: string;
  cacheTtlSeconds?: number;
}

function b64(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function jsonPart(value: unknown): string {
  return b64(JSON.stringify(value));
}

export class Ed25519EntitlementTokenSigner implements EntitlementTokenSigner {
  private readonly privateKey;
  private readonly keyId: string;
  private readonly issuer: string;
  private readonly cacheTtlSeconds: number;

  constructor(options: EntitlementTokenSignerOptions) {
    this.privateKey = createPrivateKey(options.privateKeyPem);
    this.keyId = options.keyId;
    this.issuer = options.issuer ?? "innotrepid-security";
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? 15 * 60;
  }

  sign(input: {
    appId: string;
    subjectId: string;
    productId: string;
    entitlement: Entitlement;
    verificationId: string;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const expiry = input.entitlement.expiresAt
      ? Math.floor(new Date(input.entitlement.expiresAt).getTime() / 1000)
      : now + this.cacheTtlSeconds;
    const exp = Math.max(now + 1, expiry);
    const cacheUntil = Math.min(exp, now + this.cacheTtlSeconds);

    const header = jsonPart({ alg: "EdDSA", typ: "JWT", kid: this.keyId });
    const payload = jsonPart({
      iss: this.issuer,
      aud: input.appId,
      appId: input.appId,
      entitlementId: input.entitlement.id,
      status: input.entitlement.status,
      policyVersion: input.entitlement.policyVersion,
      iat: now,
      exp,
      cacheUntil,
      verificationId: input.verificationId,
      subjectId: input.subjectId,
      productId: input.productId,
      kid: this.keyId,
    });

    const signingInput = header + "." + payload;
    const signature = sign(null, Buffer.from(signingInput), this.privateKey);
    return signingInput + "." + signature.toString("base64url");
  }
}
