import { GoogleAuth } from "google-auth-library";
import type { AppIdentity } from "./domain.js";
import type {
  IntegrityProvider,
  IntegrityVerification,
  PurchaseProvider,
  PurchaseVerification,
} from "./providers.js";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const PLAY_INTEGRITY_SCOPE = "https://www.googleapis.com/auth/playintegrity";
const PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const INTEGRITY_BASE = "https://playintegrity.googleapis.com/v1";
const MAX_INTEGRITY_AGE_MS = 2 * 60 * 1000;

function responseStatus(error: unknown): number | undefined {
  const value = error as { response?: { status?: number } };
  return value.response?.status;
}

function authFor(scope: string, keyFilename?: string): GoogleAuth {
  return new GoogleAuth({
    scopes: [scope],
    ...(keyFilename ? { keyFilename } : {}),
  });
}

async function googleRequest<T>(
  auth: GoogleAuth,
  url: string,
  init: { method: "GET" | "POST"; data?: unknown },
): Promise<T> {
  const client = await auth.getClient();
  const response = await client.request<T>({
    url,
    method: init.method,
    data: init.data,
  });
  return response.data;
}

export interface GooglePurchaseProviderOptions {
  keyFilename?: string;
}

export class GooglePlayPurchaseProvider implements PurchaseProvider {
  private readonly auth: GoogleAuth;

  constructor(options: GooglePurchaseProviderOptions = {}) {
    this.auth = authFor(ANDROID_PUBLISHER_SCOPE, options.keyFilename);
  }

  async verify(input: {
    app: AppIdentity;
    purchaseToken: string;
  }): Promise<PurchaseVerification> {
    const productUrl =
      `${PUBLISHER_BASE}/applications/${encodeURIComponent(input.app.packageName)}/purchases/productsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;

    try {
      const product = await googleRequest<any>(this.auth, productUrl, { method: "GET" });
      if (product.purchaseStateContext?.purchaseState !== "PURCHASED") {
        return { valid: false };
      }

      const line = product.productLineItem?.[0];
      if (!line?.productId) return { valid: false };

      return {
        valid: true,
        subjectId:
          product.obfuscatedExternalAccountId ??
          product.obfuscatedExternalProfileId ??
          `purchase:${input.purchaseToken.slice(0, 16)}`,
        productId: line.productId,
      };
    } catch (error) {
      const status = responseStatus(error);
      if (status !== 400 && status !== 404) throw error;
    }

    const subscriptionUrl =
      `${PUBLISHER_BASE}/applications/${encodeURIComponent(input.app.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;

    try {
      const subscription = await googleRequest<any>(this.auth, subscriptionUrl, { method: "GET" });
      const state = subscription.subscriptionState;
      const line = subscription.lineItems?.[0];

      if (!line?.productId) return { valid: false };

      const acceptedStates = new Set([
        "SUBSCRIPTION_STATE_ACTIVE",
        "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
        "SUBSCRIPTION_STATE_CANCELED",
      ]);

      if (!acceptedStates.has(state)) return { valid: false };

      return {
        valid: true,
        subjectId:
          subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId ??
          `purchase:${input.purchaseToken.slice(0, 16)}`,
        productId: line.productId,
        expiresAt: line.expiryTime,
      };
    } catch {
      return { valid: false };
    }
  }
}

export interface GoogleIntegrityProviderOptions {
  keyFilename?: string;
  maxAgeMs?: number;
}

export class GooglePlayIntegrityProvider implements IntegrityProvider {
  private readonly auth: GoogleAuth;
  private readonly maxAgeMs: number;

  constructor(options: GoogleIntegrityProviderOptions = {}) {
    this.auth = authFor(PLAY_INTEGRITY_SCOPE, options.keyFilename);
    this.maxAgeMs = options.maxAgeMs ?? MAX_INTEGRITY_AGE_MS;
  }

  async verify(input: {
    app: AppIdentity;
    integrityToken: string;
    requestHash?: string;
  }): Promise<IntegrityVerification> {
    const url =
      `${INTEGRITY_BASE}/${encodeURIComponent(input.app.packageName)}:decodeIntegrityToken`;

    let payload: any;
    try {
      payload = await googleRequest<any>(this.auth, url, {
        method: "POST",
        data: { integrity_token: input.integrityToken },
      });
    } catch {
      return { valid: false, reason: "integrity_decode_failed" };
    }

    const details = payload?.tokenPayloadExternal?.requestDetails;
    const appIntegrity = payload?.tokenPayloadExternal?.appIntegrity;

    if (!details || !appIntegrity) {
      return { valid: false, reason: "integrity_payload_missing" };
    }

    if (details.requestPackageName !== input.app.packageName) {
      return {
        valid: false,
        reason: "integrity_package_mismatch",
        packageName: details.requestPackageName,
      };
    }

    if (
      input.requestHash !== undefined &&
      details.requestHash !== input.requestHash
    ) {
      return {
        valid: false,
        reason: "integrity_request_mismatch",
        packageName: details.requestPackageName,
      };
    }

    const timestamp = Number(details.timestampMillis);
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > this.maxAgeMs || timestamp > Date.now() + 30_000) {
      return {
        valid: false,
        reason: "integrity_token_stale",
        packageName: details.requestPackageName,
      };
    }

    if (appIntegrity.appRecognitionVerdict !== "PLAY_RECOGNIZED") {
      return {
        valid: false,
        reason: "app_not_play_recognized",
        packageName: appIntegrity.packageName,
      };
    }

    return {
      valid: true,
      appId: input.app.appId,
      packageName: appIntegrity.packageName,
    };
  }
}
