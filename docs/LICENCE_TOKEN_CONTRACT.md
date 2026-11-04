# Offline licence token contract

This document freezes the current Mercate v1 wire format so the future SDK and Key Manager do not invent an incompatible format.

## V1 wire format (existing and immutable)

```text
base64url(payloadUtf8Bytes, no padding).base64url(ed25519Signature, no padding)
```

The Ed25519 signature is calculated over the exact payload UTF-8 bytes. Verification must use the original decoded bytes, not parsed and re-serialized JSON. The public key is 32 bytes; the signature is 64 bytes. Base64url decoding may accept correctly padded or unpadded input, but issuers should emit unpadded output consistently.

Example payload (illustrative values only):

```json
{
  "schemaVersion": 1,
  "product": "mercate",
  "businessId": "business-uuid",
  "licenseId": "licence-unique-id",
  "issuedAt": "2026-11-01T09:00:00.000Z",
  "expiresAt": "2026-12-01T09:00:00.000Z",
  "graceDays": 3,
  "maxDevices": 2
}
```

### Required fields

| Field | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | integer | Must equal `1` |
| `product` | string | Must equal `mercate` |
| `businessId` | string | Non-empty permanent business UUID |
| `licenseId` | string | Non-empty unique issuer-side identifier |
| `issuedAt` | ISO-8601 timestamp | Must parse to a valid instant |
| `expiresAt` | ISO-8601 timestamp | Must be later than `issuedAt` |
| `graceDays` | integer | Non-negative; defaults to zero in the current client if omitted |
| `maxDevices` | integer or null | If present, must be positive; null/omitted means unlimited |

Unknown fields may be ignored by the current v1 consumer, but issuers must not rely on unknown fields being enforced. A future incompatible claim or changed interpretation requires a new schema version and an explicit migration.

## Issuance rules

- The issuer generates `licenseId` and binds the token to the exact `businessId` supplied by Mercate.
- All timestamps represent instants and must include an explicit UTC offset; UTC `Z` output is preferred.
- The signed `expiresAt` is authoritative. The client must not calculate a replacement expiry from a local duration.
- Weekly term: issue time plus exactly seven elapsed days.
- Monthly term: add one calendar month in the billing timezone while preserving local time; if the target month lacks the original day, clamp to its final day. Convert that resulting local instant to UTC before signing. Examples: Jan 31 → Feb 28 in a common year; Jan 31 → Feb 29 in a leap year.
- Custom term: issuer supplies the chosen exact expiry instant.
- `graceDays` is applied after `expiresAt` as a separate grace window; it does not modify the signed expiry.
- `maxDevices` is a policy claim only until server/device enrolment exists. Do not claim enforcement based on this field alone.

## Security requirements

1. Never place the Ed25519 private key in Mercate, a Flutter SDK, an APK, this repository, or client build arguments.
2. Keep the private key in the issuer/Key Manager environment with access controls, encrypted backup and key-rotation procedures.
3. Embed only the corresponding public key in a customer app build.
4. Verify signature before trusting any payload field.
5. After signature verification, validate schema, product, business binding, timestamp ordering and numeric bounds.
6. Do not accept a valid token for a different business.
7. Never log full licence tokens or private key material.
8. Treat local time and local cache as untrusted inputs; use signed expiry and explicit rollback policy.
9. A failed online check must not delete or alter business data.
10. Do not use client-side UI gating as the only protection for server-authorized premium entitlements.

## Versioning and evolution

V1 must remain verifiable for already issued customers. Do not add mandatory fields to v1 or change the meaning of existing fields.

When a future requirement needs signed metadata such as billing cadence, issuer key ID, device binding, revocation epoch or entitlement feature set, define a new schema version with:
- a documented canonical wire representation;
- explicit backward-compatibility behavior;
- test vectors containing payload bytes, public key, signature and expected claims;
- migration and key-rotation procedures.

For monthly billing, the current v1 format already carries the exact signed expiry. The Key Manager can calculate calendar-aware monthly expiry without adding a cadence claim to the token. If the customer-facing app later needs to display the billing cadence, add it only through a versioned contract rather than silently changing v1.
