import type { Server } from "node:http";
import { MemoryEntitlementStore } from "./store.js";
import {
  UnconfiguredIntegrityProvider,
  UnconfiguredPurchaseProvider,
} from "./providers.js";
import { createSecurityHttpServer } from "./http.js";

export function createDefaultSecurityServer(): Server {
  return createSecurityHttpServer({
    verification: {
      purchaseProvider: new UnconfiguredPurchaseProvider(),
      integrityProvider: new UnconfiguredIntegrityProvider(),
      store: new MemoryEntitlementStore(),
    },
  });
}

const port = Number(process.env.PORT ?? 8080);

if (process.argv[1]?.endsWith("/server.js")) {
  createDefaultSecurityServer().listen(port, () => {
    console.log(`Innotrepid Security server listening on port ${port}`);
  });
}
