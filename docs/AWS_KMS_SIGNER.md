# AWS KMS Ed25519 signer adapter

This adapter implements the existing `MercateLicenseSigner` contract. It is an optional server-side integration and does not provision AWS resources or change the Mercate v1 token format.

## Required KMS key configuration

Create or select an asymmetric KMS key with:

- Key spec: `ECC_NIST_EDWARDS25519`
- Key usage: `SIGN_VERIFY`
- Signing algorithm: `ED25519_SHA_512`

The adapter requires the full key ARN (not an alias) and calls `GetPublicKey` during initialization. It fails closed unless the returned ARN exactly matches the configured ARN, the key spec and usage are correct, the algorithm is advertised, and the exported SPKI public key parses as Ed25519.

Signing uses `Sign` with `MessageType: RAW`. Do not switch to `ED25519_PH_SHA_512` or pre-hash the payload: that is a different EdDSA variant and will not verify as the current Mercate v1 Ed25519 signature.

AWS KMS limits raw signing messages to 4096 bytes. The adapter rejects larger payloads before making a KMS request. The current compact v1 licence payload is expected to remain well below this limit.

## Runtime permissions and credentials

The runtime identity needs only:

- `kms:GetPublicKey` on the pinned key ARN
- `kms:Sign` on the pinned key ARN, constrained by `kms:SigningAlgorithm = ED25519_SHA_512`

Do not grant the Key Manager runtime `kms:CreateKey`, `kms:ScheduleKeyDeletion`, `kms:PutKeyPolicy`, `kms:DisableKey`, or broad account-wide KMS access. Keep key administration separate from signing.

Use an AWS workload identity appropriate to the eventual host (for example, an attached role or federated workload role). Do not put AWS access keys in this repository, browser code, Mercate, CI build artifacts, or customer machines. The adapter accepts an AWS SDK v3 `KMSClient`; the caller owns its region, credential provider and lifecycle.

## Initialization and use

```ts
import { KMSClient } from "@aws-sdk/client-kms";
import {
  AwsKmsEd25519MercateLicenseSigner,
  createMercateKeyManagerServer,
  adaptNodePostgresPool,
} from "@innotrepid/security-server";

const kms = new KMSClient({ region: process.env.AWS_REGION });
const signer = await AwsKmsEd25519MercateLicenseSigner.create(
  kms,
  process.env.MERCATE_LICENSE_KMS_KEY_ARN!,
);

const publicKeyPem = signer.getPublicKeyPem();
// Publish/pin this public key in the customer verifier release process.
// Never expose KMS credentials or the signer object to the browser.

const server = createMercateKeyManagerServer({
  googleClientId: process.env.GOOGLE_CLIENT_ID!,
  allowedOperators,
  database: adaptNodePostgresPool(pool),
  signer,
});

// The caller still controls server.listen(), HTTPS proxying and shutdown.
```

The snippet is illustrative only; this repository does not contain production environment values, AWS account configuration, a listener, or deployment bootstrap.

## Public-key rollout and rotation

- Export the SPKI DER or PEM with `getPublicKeyDer()` / `getPublicKeyPem()`.
- Convert/pin the corresponding Ed25519 public key in the Mercate SDK through a reviewed release.
- Verify an issued test token using the actual Dart verifier before enabling issuance.
- Do not replace the verifier's trusted key with a key supplied by a licence token or browser.
- Treat a new KMS key ARN as a key rotation event: deploy and verify a client release that trusts the new public key before issuing licences with it. Keep old public keys trusted for already-issued licences until their supported expiry/recovery window is complete.
- Plan a documented emergency revocation and recovery procedure before production customer issuance.

No AWS resource is created by this adapter or its tests. Tests use generated in-memory Ed25519 keys and a fake KMS client; they do not call AWS.
