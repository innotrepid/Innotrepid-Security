import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresMercateLicenseRegistryStore,
  type SqlConnectionPool,
  type SqlQueryResult,
  type SqlTransactionClient,
} from "../src/mercate_postgres_store.js";

class FakeClient implements SqlTransactionClient {
  readonly statements: string[] = [];
  released = false;

  async query<Row = Record<string, unknown>>(
    text: string,
    _values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>> {
    this.statements.push(text);
    return { rows: [] };
  }

  release(): void {
    this.released = true;
  }
}

class FakePool implements SqlConnectionPool {
  readonly client = new FakeClient();

  async query<Row = Record<string, unknown>>(
    _text: string,
    _values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>> {
    return { rows: [] };
  }

  async connect(): Promise<SqlTransactionClient> {
    return this.client;
  }
}

test("PostgreSQL store acquires a business lock and commits successful work", async () => {
  const pool = new FakePool();
  const store = new PostgresMercateLicenseRegistryStore(pool);
  const result = await store.transact("business-1", async (transaction) => {
    assert.equal(await transaction.getCurrent("business-1"), undefined);
    assert.equal(
      await transaction.getIdempotentResult("business-1", "retry-1"),
      undefined,
    );
    return "completed";
  });

  assert.equal(result, "completed");
  assert.match(pool.client.statements[0], /^BEGIN$/);
  assert.match(pool.client.statements[1], /pg_advisory_xact_lock/);
  assert.match(pool.client.statements[2], /status = 'current'/);
  assert.match(pool.client.statements[3], /idempotency_key/);
  assert.equal(pool.client.statements.at(-1), "COMMIT");
  assert.equal(pool.client.released, true);
});

test("PostgreSQL store rolls back failed lifecycle work and releases connection", async () => {
  const pool = new FakePool();
  const store = new PostgresMercateLicenseRegistryStore(pool);

  await assert.rejects(
    store.transact("business-1", async () => {
      throw new Error("simulated_failure");
    }),
    /simulated_failure/,
  );

  assert.equal(pool.client.statements[0], "BEGIN");
  assert.match(pool.client.statements[1], /pg_advisory_xact_lock/);
  assert.equal(pool.client.statements.at(-1), "ROLLBACK");
  assert.equal(pool.client.released, true);
});
