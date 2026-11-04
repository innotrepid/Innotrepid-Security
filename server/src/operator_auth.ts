export type KeyManagerRole = "administrator" | "licensing_operator" | "read_only";
export type KeyManagerPermission =
  | "mercate:licenses:read"
  | "mercate:licenses:write"
  | "mercate:operators:manage";

const ROLE_PERMISSIONS: Record<KeyManagerRole, readonly KeyManagerPermission[]> = {
  administrator: [
    "mercate:licenses:read",
    "mercate:licenses:write",
    "mercate:operators:manage",
  ],
  licensing_operator: ["mercate:licenses:read", "mercate:licenses:write"],
  read_only: ["mercate:licenses:read"],
};

export interface VerifiedOperatorIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  issuer: string;
}

export interface OperatorTokenVerifier {
  verify(idToken: string, audience: string): Promise<VerifiedOperatorIdentity>;
}

export interface AllowedOperator {
  email: string;
  roles: readonly KeyManagerRole[];
}

export interface KeyManagerPrincipal {
  /** Stable provider subject; never sourced from a request body. */
  actorId: string;
  email: string;
  roles: readonly KeyManagerRole[];
  permissions: readonly KeyManagerPermission[];
}

export interface OperatorAuthenticatorOptions {
  audience: string;
  allowedOperators: readonly AllowedOperator[];
  verifier: OperatorTokenVerifier;
}

export class OperatorAuthenticationError extends Error {
  constructor(
    readonly code: "missing_bearer_token" | "invalid_bearer_token" | "operator_not_allowed",
  ) {
    super(code);
    this.name = "OperatorAuthenticationError";
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isRole(value: string): value is KeyManagerRole {
  return value === "administrator" ||
    value === "licensing_operator" ||
    value === "read_only";
}

export class KeyManagerOperatorAuthenticator {
  private readonly operators: Map<string, readonly KeyManagerRole[]>;

  constructor(private readonly options: OperatorAuthenticatorOptions) {
    if (!options.audience.trim()) throw new Error("oidc_audience_required");
    this.operators = new Map();
    for (const operator of options.allowedOperators) {
      const email = normalizeEmail(operator.email);
      if (!email || !operator.roles.length || operator.roles.some((role) => !isRole(role))) {
        throw new Error("invalid_operator_allowlist_entry");
      }
      if (this.operators.has(email)) throw new Error("duplicate_operator_email");
      this.operators.set(email, [...new Set(operator.roles)]);
    }
  }

  async authenticate(authorizationHeader: string | undefined): Promise<KeyManagerPrincipal> {
    if (!authorizationHeader?.startsWith("Bearer ")) {
      throw new OperatorAuthenticationError("missing_bearer_token");
    }
    const token = authorizationHeader.slice("Bearer ".length).trim();
    if (!token || token.length > 16_384 || /\s/.test(token)) {
      throw new OperatorAuthenticationError("invalid_bearer_token");
    }

    let identity: VerifiedOperatorIdentity;
    try {
      identity = await this.options.verifier.verify(token, this.options.audience);
    } catch {
      throw new OperatorAuthenticationError("invalid_bearer_token");
    }

    if (
      !identity.subject.trim() ||
      !identity.email.trim() ||
      !identity.emailVerified ||
      !["accounts.google.com", "https://accounts.google.com"].includes(identity.issuer)
    ) {
      throw new OperatorAuthenticationError("invalid_bearer_token");
    }

    const email = normalizeEmail(identity.email);
    const roles = this.operators.get(email);
    if (!roles) throw new OperatorAuthenticationError("operator_not_allowed");

    const permissions = [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
    return {
      actorId: `google:${identity.subject}`,
      email,
      roles,
      permissions,
    };
  }
}

export function hasKeyManagerPermission(
  principal: KeyManagerPrincipal,
  permission: KeyManagerPermission,
): boolean {
  return principal.permissions.includes(permission);
}
