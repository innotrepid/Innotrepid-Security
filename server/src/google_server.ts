import { createSecurityHttpServer } from "./http.js";
import { GooglePlayIntegrityProvider, GooglePlayPurchaseProvider } from "./google_providers.js";
import { MemoryEntitlementStore } from "./store.js";
import { Ed25519EntitlementTokenSigner } from "./token.js";

export function createGoogleBackedSecurityServer() {
  const privateKeyPem = process.env.INNOTREPID_SECURITY_ENTITLEMENT_PRIVATE_KEY;
  const keyId = process.env.INNOTREPID_SECURITY_ENTITLEMENT_KEY_ID;

  if (!privateKeyPem || !keyId) {
    throw new Error("Entitlement signing key is not configured.");
  }

  return createSecurityHttpServer({
    verification: {
      purchaseProvider: new GooglePlayPurchaseProvider(),
      integrityProvider: new GooglePlayIntegrityProvider(),
      store: new MemoryEntitlementStore(),
      tokenSigner: new Ed25519EntitlementTokenSigner({
        privateKeyPem,
        keyId,
      }),
    },
  });
}
