import { Pool, type PoolClient } from 'pg';

import type { Logger } from '../../application/ports/logger';

/** A connection pool. Created once per process in `main/`; adapters receive it as a parameter. */
export type DbPool = Pool;

/** Anything that can run a query: the pool itself or a client checked out for a transaction. */
export type Queryable = Pool | PoolClient;

/**
 * Most connections one process opens. A Lambda instance serves one request at a time, but a use
 * case may run a few queries in parallel (`Promise.all`). Neon's pooled endpoint multiplexes these
 * onto a small number of server connections, so a low ceiling costs nothing.
 */
export const POOL_MAX_CONNECTIONS = 3;

/**
 * How long to wait for a new connection. Neon suspends an idle compute after 5 minutes, and the
 * first connection afterwards waits for it to resume, so this is generous on purpose.
 */
export const CONNECT_TIMEOUT_MS = 10_000;

/**
 * How long an unused connection stays open. Short, so a Lambda instance that thaws after a long
 * freeze is less likely to reuse a socket the server has already closed.
 */
export const IDLE_TIMEOUT_MS = 10_000;

/**
 * Client-side ceiling for a single query. Enforced by node-postgres rather than as a
 * `statement_timeout` startup parameter, which a transaction-mode pooler may reject.
 */
export const QUERY_TIMEOUT_MS = 15_000;

/**
 * Creates a node-postgres pool (ADR 0006). Connecting is lazy: nothing touches the network until
 * the first query, so building the pool at cold start is free.
 *
 * TLS comes from the connection string (`sslmode=verify-full` for Neon). Channel binding
 * (SCRAM-SHA-256-PLUS) is used whenever the server offers it over TLS, which is what Neon's
 * `channel_binding=require` asks libpq for; plain local connections fall back to SCRAM-SHA-256.
 *
 * @param options.connectionString - a `postgres://` URL. Never logged.
 * @param options.logger - receives `db.pool_error` when an idle connection fails. Without this
 *   listener node-postgres would emit an unhandled `error` event and crash the process.
 *
 * @example
 * const pool = createPool({ connectionString: env.DATABASE_URL, logger });
 */
export function createPool(options: { connectionString: string; logger: Logger }): DbPool {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: POOL_MAX_CONNECTIONS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    enableChannelBinding: true,
  });
  pool.on('error', (error) => {
    options.logger.error('db.pool_error', error);
  });
  return pool;
}
