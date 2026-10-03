import { createSecurityHttpServer } from "./http.js";
import { GooglePlayIntegrityProvider, GooglePlayPurchaseProvider } from "./google_providers.js";
import { MemoryEntitlementStore } from "./store.js";

export function createGoogleBackedSecurityServer() {
  return createSecurityHttpServer({
    verification: {
      purchaseProvider: new GooglePlayPurchaseProvider(),
      integrityProvider: new GooglePlayIntegrityProvider(),
      store: new MemoryEntitlementStore(),
    },
  });
}
