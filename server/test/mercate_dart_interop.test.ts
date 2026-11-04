import assert from "node:assert/strict";
import { test } from "node:test";
import {
  issueMercateLicense,
  PemEd25519MercateLicenseSigner,
} from "../src/mercate_license.js";

// Test-only Ed25519 key. This private key must never be reused outside tests.
const fixturePrivateKeyPem = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEID/kOHWdvw/yrvKYSaEPpBzbyicrN3R70o3WOWN0jSxR
-----END PRIVATE KEY-----`;

const dartVerifierFixtureToken =
  "eyJzY2hlbWFWZXJzaW9uIjoxLCJwcm9kdWN0IjoibWVyY2F0ZSIsImJ1c2luZXNzSWQiOiJjcm9zcy1sYW5ndWFnZS1idXNpbmVzcy0wMDEiLCJsaWNlbnNlSWQiOiJjcm9zcy1sYW5ndWFnZS1saWNlbnNlLTAwMSIsImlzc3VlZEF0IjoiMjAyNi0xMS0wNFQwOToxNTowMC4wMDBaIiwiZXhwaXJlc0F0IjoiMjAyNi0xMS0xMVQwOToxNTowMC4wMDBaIiwiZ3JhY2VEYXlzIjo0LCJtYXhEZXZpY2VzIjozfQ.26ON5IivEoWRgd3-2p49lDzTuatmgLhbFjrQBOgYCqbN3UmKxnkDko9hvkBcl-AFKAQcK4AY-3eLgVJXAXniAA";

test("server issuer reproduces the signed fixture consumed by the Dart verifier", async () => {
  const issued = await issueMercateLicense(
    {
      businessId: "cross-language-business-001",
      licenseId: "cross-language-license-001",
      issuedAt: new Date("2026-11-04T09:15:00.000Z"),
      term: { kind: "weekly" },
      graceDays: 4,
      maxDevices: 3,
    },
    new PemEd25519MercateLicenseSigner(fixturePrivateKeyPem),
  );

  assert.equal(issued.claims.expiresAt, "2026-11-11T09:15:00.000Z");
  assert.equal(issued.token, dartVerifierFixtureToken);
});
