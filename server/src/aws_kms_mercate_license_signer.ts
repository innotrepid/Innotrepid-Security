import { createPublicKey, type KeyObject } from "node:crypto";
import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
} from "@aws-sdk/client-kms";
import type { MercateLicenseSigner } from "./mercate_license.js";

const SIGNING_ALGORITHM = "ED25519_SHA_512" as const;
const MAX_KMS_RAW_MESSAGE_BYTES = 4096;
const ED25519_SIGNATURE_BYTES = 64;

/**
 * AWS KMS-backed Ed25519 signer for the immutable Mercate v1 token format.
 *
 * Construct with create(), which fetches and validates the public key metadata
 * before the signer can be used. The caller owns the KMSClient lifecycle and
 * supplies credentials through the AWS SDK's normal provider chain/workload
 * identity; this class never accepts or stores static AWS credentials.
 */
export class AwsKmsEd25519MercateLicenseSigner implements MercateLicenseSigner {
  private constructor(
    private readonly client: KMSClient,
    readonly keyArn: string,
    private readonly publicKeyDer: Uint8Array,
    private readonly publicKey: KeyObject,
  ) {}

  static async create(
    client: KMSClient,
    keyArn: string,
  ): Promise<AwsKmsEd25519MercateLicenseSigner> {
    if (!/^arn:[a-z0-9-]+:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-fA-F-]{36}$/.test(keyArn)) {
      throw new Error("aws_kms_key_arn_required");
    }

    const metadata = await client.send(new GetPublicKeyCommand({ KeyId: keyArn }));
    if (metadata.KeyId !== keyArn) {
      throw new Error("aws_kms_key_identity_mismatch");
    }
    if (metadata.KeySpec !== "ECC_NIST_EDWARDS25519") {
      throw new Error("aws_kms_key_must_be_ed25519");
    }
    if (metadata.KeyUsage !== "SIGN_VERIFY") {
      throw new Error("aws_kms_key_must_allow_sign_verify");
    }
    if (!metadata.SigningAlgorithms?.includes(SIGNING_ALGORITHM)) {
      throw new Error("aws_kms_ed25519_signing_algorithm_unavailable");
    }
    if (!metadata.PublicKey || metadata.PublicKey.length === 0) {
      throw new Error("aws_kms_public_key_missing");
    }

    const publicKeyDer = Uint8Array.from(metadata.PublicKey);
    let publicKey: KeyObject;
    try {
      publicKey = createPublicKey({
        key: Buffer.from(publicKeyDer),
        format: "der",
        type: "spki",
      });
    } catch {
      throw new Error("aws_kms_public_key_invalid");
    }
    if (publicKey.asymmetricKeyType !== "ed25519") {
      throw new Error("aws_kms_public_key_must_be_ed25519");
    }

    return new AwsKmsEd25519MercateLicenseSigner(
      client,
      keyArn,
      publicKeyDer,
      publicKey,
    );
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    if (payload.byteLength > MAX_KMS_RAW_MESSAGE_BYTES) {
      throw new Error("mercate_license_payload_exceeds_aws_kms_limit");
    }

    const response = await this.client.send(new SignCommand({
      KeyId: this.keyArn,
      Message: Buffer.from(payload),
      MessageType: "RAW",
      SigningAlgorithm: SIGNING_ALGORITHM,
    }));

    if (!response.Signature || response.Signature.length !== ED25519_SIGNATURE_BYTES) {
      throw new Error("aws_kms_returned_invalid_ed25519_signature");
    }
    return Uint8Array.from(response.Signature);
  }

  /** DER-encoded X.509 SubjectPublicKeyInfo for the existing Dart verifier. */
  getPublicKeyDer(): Uint8Array {
    return Uint8Array.from(this.publicKeyDer);
  }

  /** PEM-encoded SubjectPublicKeyInfo for embedding in server-side config/builds. */
  getPublicKeyPem(): string {
    return this.publicKey.export({ format: "pem", type: "spki" }).toString();
  }
}
