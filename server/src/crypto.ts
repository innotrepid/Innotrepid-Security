import { createHash } from "node:crypto";

export function hashPurchaseToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildIntegrityRequestHash(input: {
  requestId: string;
  appId: string;
  packageName: string;
  version: string;
  buildNumber?: string;
  purchaseToken: string;
}): string {
  const purchaseHash = createHash("sha256")
    .update(input.purchaseToken, "utf8")
    .digest("base64url");

  const canonical = [
    input.requestId,
    input.appId,
    input.packageName,
    input.version,
    input.buildNumber ?? "",
    purchaseHash,
  ].join("|");

  return createHash("sha256").update(canonical, "utf8").digest("base64url");
}
