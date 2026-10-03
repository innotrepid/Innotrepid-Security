import type { AppIdentity, Entitlement } from "./domain.js";

interface AppDefinition {
  packageName: string;
  entitlements: string[];
}

const registry: Record<string, AppDefinition> = {
  resonate: {
    packageName: "com.innotrepid.resonate",
    entitlements: ["premium"],
  },
  mercate: {
    packageName: "com.innotrepid.mercate",
    entitlements: ["pro"],
  },
  video_player: {
    packageName: "com.innotrepid.video_player",
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

export function canGrant(definition: AppDefinition, entitlementId: string): boolean {
  return definition.entitlements.includes(entitlementId);
}
