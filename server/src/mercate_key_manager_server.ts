import type { Server } from "node:http";
import {
  KeyManagerOperatorAuthenticator,
  type AllowedOperator,
} from "./operator_auth.js";
import { GoogleOidcTokenVerifier } from "./google_oidc.js";
import {
  PemEd25519MercateLicenseSigner,
  type MercateLicenseSigner,
} from "./mercate_license.js";
import { PostgresMercateLicenseRegistryStore, type SqlConnectionPool } from "./mercate_postgres_store.js";
import { MercateLicenseRegistryService } from "./mercate_registry.js";
import { createKeyManagerHttpServer } from "./key_manager_http.js";

export interface MercateKeyManagerServerOptions {
  /** Google OAuth Web client ID configured as the OIDC token audience. */
  googleClientId: string;
  /** Explicit server-owned operator allowlist. Never derive this from browser input. */
  allowedOperators: readonly AllowedOperator[];
  /** Durable PostgreSQL pool adapter. Do not supply the test-only memory store. */
  database: SqlConnectionPool;
  /** Prefer an HSM/KMS-backed signer adapter when available. */
  signer: MercateLicenseSigner;
  now?: () => Date;
}

/**
 * Composes the authenticated Key Manager HTTP server without listening on a
 * port or mounting it into the general security server.
 *
 * The caller owns the database pool lifecycle and must expose this server only
 * behind a trusted HTTPS reverse proxy with rate limiting and strict routing.
 */
export function createMercateKeyManagerServer(
  options: MercateKeyManagerServerOptions,
): Server {
  if (!options.googleClientId.trim()) throw new Error("google_client_id_required");
  if (!options.allowedOperators.length) throw new Error("operator_allowlist_required");
  if (
    !options.database ||
    typeof options.database.query !== "function" ||
    typeof options.database.connect !== "function"
  ) {
    throw new Error("durable_database_pool_required");
  }
  if (!options.signer || typeof options.signer.sign !== "function") {
    throw new Error("mercate_license_signer_required");
  }

  const authenticator = new KeyManagerOperatorAuthenticator({
    audience: options.googleClientId,
    allowedOperators: options.allowedOperators,
    verifier: new GoogleOidcTokenVerifier(),
  });
  const store = new PostgresMercateLicenseRegistryStore(options.database);
  const registry = new MercateLicenseRegistryService(store, options.signer);

  return createKeyManagerHttpServer({
    authenticator,
    registry,
    now: options.now,
  });
}

/**
 * Convenience helper for a private-key PEM injected by a deployment secret
 * manager. Never store the returned signer in browser code or source control.
 *
 * This is a transitional secret-injection adapter, not an HSM/KMS integration.
 */
export function createPemMercateLicenseSigner(privateKeyPem: string): MercateLicenseSigner {
  return new PemEd25519MercateLicenseSigner(privateKeyPem);
}
