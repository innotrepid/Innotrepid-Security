import type { Pool, PoolClient } from "pg";
import type {
  SqlConnectionPool,
  SqlExecutor,
  SqlQueryResult,
  SqlTransactionClient,
} from "./mercate_postgres_store.js";

/**
 * Adapts node-postgres to the narrow registry SQL contract.
 *
 * The adapter copies readonly parameter arrays because node-postgres accepts
 * mutable arrays. Query rows are passed through without changing their shape.
 */
function executor(client: Pick<Pool | PoolClient, "query">): SqlExecutor {
  return {
    async query<Row = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<SqlQueryResult<Row>> {
      const result = await client.query(text, values ? [...values] : undefined);
      return { rows: result.rows as Row[] };
    },
  };
}

export function adaptNodePostgresPool(pool: Pool): SqlConnectionPool {
  return {
    ...executor(pool),
    async connect(): Promise<SqlTransactionClient> {
      const client = await pool.connect();
      return {
        ...executor(client),
        release(): void {
          client.release();
        },
      };
    },
  };
}
