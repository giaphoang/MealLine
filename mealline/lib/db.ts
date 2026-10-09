import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
const transaction = new AsyncLocalStorage<PoolClient>();
export const currentTransaction = () => transaction.getStore();

let pool: Pool | null = null;

export function databaseUrl(): string {
  const url =
    process.env.MEALLINE_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url) {
    throw new Error(
      "Set MEALLINE_DATABASE_URL (or DATABASE_URL), e.g. postgres://foodfit:foodfit@127.0.0.1:5432/mealline"
    );
  }
  return url;
}

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl(), max: 10 });
  }
  const client = currentTransaction();
  if (!client) return pool;
  return new Proxy(pool, { get(target, name) {
    if (name === 'query') return client.query.bind(client);
    const value = Reflect.get(target, name);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

export async function inTransaction<T>(action: () => Promise<T>, supplied?: PoolClient): Promise<T> {
  if (currentTransaction()) return action();
  const client = supplied ?? await db().connect();
  try {
    await client.query('BEGIN');
    const result = await transaction.run(client, action);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { if (!supplied) client.release(); }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
