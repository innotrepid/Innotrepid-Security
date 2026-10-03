import type { AppIdentity } from "./domain.js";

export interface AppProduct {
  productId: string;
  entitlementId: string;
  type: "non_consumable" | "subscription";
}

export interface AppDefinition {
  packageName: string;
  products: AppProduct[];
  entitlements: string[];
}

const registry: Record<string, AppDefinition> = {
  resonate: {
    packageName: "com.innotrepid.resonate",
    products: [
      {
        productId: "resonate_premium",
        entitlementId: "premium",
        type: "non_consumable",
      },
    ],
    entitlements: ["premium"],
  },
  mercate: {
    packageName: "com.innotrepid.mercate",
    products: [
      {
        productId: "mercate_pro",
        entitlementId: "pro",
        type: "non_consumable",
      },
    ],
    entitlements: ["pro"],
  },
  video_player: {
    packageName: "com.innotrepid.video_player",
    products: [
      {
        productId: "video_player_premium",
        entitlementId: "premium",
        type: "non_consumable",
      },
    ],
    entitlements: ["premium"],
  },
};

export function validateApp(app: AppIdentity): AppDefinition | undefined {
  const definition = registry[app.appId];
  if (!definition || definition.packageName !== app.packageName) {
    return undefined;
  }
  return definition;
}

export function findProduct(
  definition: AppDefinition,
  productId: string,
): AppProduct | undefined {
  return definition.products.find((product) => product.productId === productId);
}

export function canGrant(
  definition: AppDefinition,
  entitlementId: string,
): boolean {
  return definition.entitlements.includes(entitlementId);
}
