# Mercate integration profile

## Current implementation audit

Mercate's `foundation` branch is the authoritative application branch. Its current licence implementation lives in:

- `lib/core/models/mercate_license.dart`
- `lib/services/license_service.dart`
- `lib/features/settings/license_settings_page.dart`

The current app verifies an offline Ed25519 token locally, binds it to the permanent `businessId`, and stores the signed token in `mercate_meta.db`. PIN/biometric app locking remains separate. Activation and renewal replace only the licence token; they do not modify business records.

The existing token is:

```text
base64url(UTF-8 JSON payload).base64url(Ed25519 signature)
```

The signature covers the exact UTF-8 payload bytes. Current schema version 1 claims are `schemaVersion`, `product`, `businessId`, `licenseId`, `issuedAt`, `expiresAt`, `graceDays`, and optional `maxDevices`.

## Distribution profiles

The reusable security system must not assume Google Play distribution.

### Direct distribution (Mercate's first profile)

- The issuer signs a licence for a specific `businessId`.
- Mercate verifies the Ed25519 signature offline with a public key compiled into the app.
- The issuer retains the private signing key outside the app and outside this repository.
- The exact signed `expiresAt` timestamp is authoritative.
- A direct APK must not require Play purchase ownership or the Play `appLicensingVerdict=LICENSED` signal.
- Optional server check-ins can support renewal, device registration, revocation and trusted-time refresh; temporary network failure must not erase or corrupt customer data.
- Offline grace and any restricted mode are explicit policy decisions, not accidental consequences of a failed request.

### Google Play distribution (future profile)

- Play Billing purchase verification and Play Integrity can be enabled for apps distributed through Google Play.
- Play-specific evidence is an additional distribution adapter, not a prerequisite for the shared entitlement model.
- A Play-distributed app and a direct APK may resolve to the same product entitlement while using different evidence-verification policies.

### Integrity signals

Treat app recognition, purchase ownership, device integrity and entitlement as distinct facts. Do not map a missing Play licensing verdict to fraud for a legitimate direct APK installation. Integrity checks should be configured by distribution profile and used as risk signals or policy inputs where appropriate.

## Business and device identity

- `businessId` identifies the licensed Mercate business, not the phone.
- `licenseId` identifies one issued licence record.
- Device enrolment must be a separate issuer/server registry operation.
- `maxDevices` is only a signed claim until enrolment and transfer rules are implemented. Do not display it as an enforced count before then.
- Restoring the same Mercate business backup preserves the business identity. Device transfer and backup restore must not silently merge unrelated business databases.

## Expiry and offline time

The issuer calculates the subscription period and signs an exact UTC `expiresAt`. The client displays the remaining time but never derives the authoritative expiry by adding a duration to its local clock.

- Weekly billing is seven elapsed days from the selected issue/activation instant.
- Monthly billing is one calendar month in the issuer-selected billing timezone, preserving local time and clamping to the last valid day of the target month (for example, January 31 to February 28/29). The issuer then converts the result to UTC and signs that exact instant.
- Custom periods use an explicitly selected end instant.
- Grace is represented by signed `graceDays` in the current Mercate token format. Grace does not extend the signed `expiresAt`; it is a separate policy window.
- Countdown text is informational. It is not a security boundary.
- Online trusted-time checks, persisted last-trusted timestamps and monotonic elapsed time during a device boot can improve rollback detection. No client-only design can promise perfect clock integrity on a fully offline or compromised device.
- Restoring an old backup can roll back locally persisted time. A later device registry/server check-in is needed to strengthen cross-restore protection.

## Safe rollout boundaries

1. Keep existing customers operational while licences are issued manually.
2. Do not make sales, stock, debtor/creditor, or other business writes depend on a new SDK until enforcement is explicitly approved and tested.
3. Preserve viewing, backup, restore and export in any future expired/restricted mode.
4. Never delete, rewrite or migrate business records as a licensing response.
5. Test database and backup compatibility before changing identity or licence storage.
6. Roll out device enforcement and read-only expiry restrictions separately, with a recovery path.

## Integration sequence

1. Freeze and test the token contract documented in `LICENCE_TOKEN_CONTRACT.md`.
2. Build the reusable Flutter SDK around the existing Mercate-compatible Ed25519 verifier and secure storage abstractions.
3. Add issuer-side signing/key management outside the customer app.
4. Add optional server verification and device registry APIs.
5. Integrate Mercate in observe-only mode first; compare SDK decisions with the existing `LicenseService`.
6. Only after parity and recovery tests, plan feature enforcement as a separate phase.
