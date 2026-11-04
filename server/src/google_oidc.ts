import { OAuth2Client } from "google-auth-library";
import type {
  OperatorTokenVerifier,
  VerifiedOperatorIdentity,
} from "./operator_auth.js";

/**
 * Verifies Google OpenID Connect ID tokens. Google validates the signature,
 * issuer, expiry and audience; the authenticator separately applies the
 * server-owned operator allowlist and role policy.
 */
export class GoogleOidcTokenVerifier implements OperatorTokenVerifier {
  private readonly client = new OAuth2Client();

  async verify(idToken: string, audience: string): Promise<VerifiedOperatorIdentity> {
    const ticket = await this.client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload) throw new Error("google_id_token_payload_missing");

    return {
      subject: payload.sub ?? "",
      email: payload.email ?? "",
      emailVerified: payload.email_verified === true,
      issuer: payload.iss ?? "",
    };
  }
}
