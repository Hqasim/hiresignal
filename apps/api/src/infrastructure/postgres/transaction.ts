import type { PoolClient } from 'pg';

import type { DbPool } from './create-pool';

/**
 * Runs `work` inside one transaction on a dedicated connection. Commits if `work` resolves and
 * rolls back if it throws, then rethrows the original error.
 *
 * @example
 * const id = await withTransaction(pool, async (tx) => {
 *   const { rows } = await tx.query('insert into jobs … returning id', values);
 *   return rows[0];
 * });
 */
export async function withTransaction<T>(
  pool: DbPool,
  work: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
