import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
} from "@aws-sdk/client-kms";
import { AwsKmsEd25519MercateLicenseSigner } from "../src/aws_kms_mercate_license_signer.js";

const keyArn = "arn:aws:kms:af-south-1:123456789012:key/12345678-1234-4234-8234-123456789abc";

function fixture(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const calls: Array<GetPublicKeyCommand | SignCommand> = [];
  const client = {
    async send(command: GetPublicKeyCommand | SignCommand) {
      calls.push(command);
      if (command instanceof GetPublicKeyCommand) {
        return {
          KeyId: keyArn,
          KeySpec: "ECC_NIST_EDWARDS25519",
          KeyUsage: "SIGN_VERIFY",
          SigningAlgorithms: ["ED25519_SHA_512"],
          PublicKey: publicKeyDer,
          ...overrides,
        };
      }
      return {
        Signature: sign(null, Buffer.from(command.input.Message as Uint8Array), privateKey),
      };
    },
  } as unknown as KMSClient;
  return { client, calls, publicKey, publicKeyDer };
}

test("creates only for the pinned Ed25519 SIGN_VERIFY key and exports its public key", async () => {
  const f = fixture();
  const signer = await AwsKmsEd25519MercateLicenseSigner.create(f.client, keyArn);

  assert.equal(signer.keyArn, keyArn);
  assert.equal(signer.getPublicKeyPem().includes("BEGIN PUBLIC KEY"), true);
  assert.deepEqual(signer.getPublicKeyDer(), new Uint8Array(f.publicKeyDer));
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0] instanceof GetPublicKeyCommand);
  assert.equal((f.calls[0] as GetPublicKeyCommand).input.KeyId, keyArn);
});

test("signs the exact raw payload with Ed25519 and produces a v1-compatible signature", async () => {
  const f = fixture();
  const signer = await AwsKmsEd25519MercateLicenseSigner.create(f.client, keyArn);
  const payload = Buffer.from('{"schemaVersion":1,"product":"mercate"}', "utf8");

  const signature = await signer.sign(payload);

  assert.equal(signature.length, 64);
  assert.equal(verify(null, payload, f.publicKey, Buffer.from(signature)), true);
  const signCommand = f.calls[1] as SignCommand;
  assert.ok(signCommand instanceof SignCommand);
  assert.equal(signCommand.input.KeyId, keyArn);
  assert.equal(signCommand.input.MessageType, "RAW");
  assert.equal(signCommand.input.SigningAlgorithm, "ED25519_SHA_512");
  assert.deepEqual(Buffer.from(signCommand.input.Message as Uint8Array), payload);
});

test("rejects aliases and non-key ARN identifiers before calling KMS", async () => {
  const f = fixture();
  await assert.rejects(
    AwsKmsEd25519MercateLicenseSigner.create(f.client, "alias/mercate-license"),
    /aws_kms_key_arn_required/,
  );
  assert.equal(f.calls.length, 0);
});

test("rejects a key identity mismatch", async () => {
  const f = fixture({ KeyId: "arn:aws:kms:af-south-1:123456789012:key/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  await assert.rejects(
    AwsKmsEd25519MercateLicenseSigner.create(f.client, keyArn),
    /aws_kms_key_identity_mismatch/,
  );
});

test("rejects a key with the wrong key spec, usage, or signing algorithm", async (t) => {
  for (const [name, override, error] of [
    ["wrong key spec", { KeySpec: "ECC_NIST_P256" }, /aws_kms_key_must_be_ed25519/],
    ["wrong key usage", { KeyUsage: "ENCRYPT_DECRYPT" }, /aws_kms_key_must_allow_sign_verify/],
    ["missing Ed25519 algorithm", { SigningAlgorithms: ["ECDSA_SHA_256"] }, /aws_kms_ed25519_signing_algorithm_unavailable/],
  ] as const) {
    await t.test(name, async () => {
      const f = fixture(override);
      await assert.rejects(
        AwsKmsEd25519MercateLicenseSigner.create(f.client, keyArn),
        error,
      );
    });
  }
});

test("rejects a public key that is not Ed25519", async () => {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const f = fixture({ PublicKey: publicKey.export({ format: "der", type: "spki" }) });
  await assert.rejects(
    AwsKmsEd25519MercateLicenseSigner.create(f.client, keyArn),
    /aws_kms_public_key_must_be_ed25519/,
  );
});

test("rejects payloads over the AWS KMS 4096-byte raw-message limit", async () => {
  const f = fixture();
  const signer = await AwsKmsEd25519MercateLicenseSigner.create(f.client, keyArn);
  await assert.rejects(signer.sign(new Uint8Array(4097)), /mercate_license_payload_exceeds_aws_kms_limit/);
  assert.equal(f.calls.length, 1, "no Sign request should be sent");
});

test("rejects malformed KMS signature responses", async () => {
  const f = fixture();
  const signer = await AwsKmsEd25519MercateLicenseSigner.create(f.client, keyArn);
  const originalSend = f.client.send.bind(f.client);
  (f.client as unknown as { send: (command: unknown) => Promise<unknown> }).send = async (command) => {
    if (command instanceof SignCommand) return { Signature: new Uint8Array(63) };
    return originalSend(command as GetPublicKeyCommand);
  };
  await assert.rejects(signer.sign(new Uint8Array([1, 2, 3])), /aws_kms_returned_invalid_ed25519_signature/);
});
