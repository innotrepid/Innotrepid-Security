import assert from "node:assert/strict";
import test from "node:test";
import { Server } from "node:http";
import {
  createMercateKeyManagerServer,
  createPemMercateLicenseSigner,
} from "../src/mercate_key_manager_server.js";

const database = {
  query: async () => ({ rows: [] }),
  connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
};
const signer = { sign: () => new Uint8Array(64) };

test("composition creates a separate server without listening", () => {
  const server = createMercateKeyManagerServer({
    googleClientId: "test-google-client.apps.googleusercontent.com",
    allowedOperators: [{ email: "operator@example.test", roles: ["administrator"] }],
    database,
    signer,
  });
  assert.ok(server instanceof Server);
  assert.equal(server.listening, false);
  server.close();
});

test("composition refuses an empty operator allowlist", () => {
  assert.throws(() => createMercateKeyManagerServer({
    googleClientId: "test-client",
    allowedOperators: [],
    database,
    signer,
  }), /operator_allowlist_required/);
});

test("composition refuses missing durable database adapter", () => {
  assert.throws(() => createMercateKeyManagerServer({
    googleClientId: "test-client",
    allowedOperators: [{ email: "operator@example.test", roles: ["administrator"] }],
    database: {} as never,
    signer,
  }), /durable_database_pool_required/);
});

test("PEM signer helper rejects empty key material", () => {
  assert.throws(() => createPemMercateLicenseSigner("  "), /signing key is required/i);
});
