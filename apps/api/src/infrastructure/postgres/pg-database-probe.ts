import type { DatabaseProbe } from '../../application/ports/database-probe';
import type { Queryable } from './create-pool';

/**
 * {@link DatabaseProbe} that runs `select 1`. It goes through the pool, so it also proves a
 * connection can be opened; the pool's connect and query timeouts bound how long it can take.
 *
 * @example
 * await createPgDatabaseProbe(pool).ping();
 */
export function createPgDatabaseProbe(db: Queryable): DatabaseProbe {
  return {
    async ping(): Promise<void> {
      await db.query('select 1');
    },
  };
}
