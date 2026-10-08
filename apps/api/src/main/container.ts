import { fileURLToPath } from 'node:url';

import type { Hono } from 'hono';

import type { Logger } from '../application/ports/logger';
import { type Env, parseEnv, parseMigrationEnv } from '../config/env';
import { systemClock } from '../infrastructure/clock/system-clock';
import { createJsonConsoleLogger } from '../infrastructure/logging/json-console-logger';
import { createPool, type DbPool } from '../infrastructure/postgres/create-pool';
import { migrate, type MigrationResult, readMigrations } from '../infrastructure/postgres/migrator';
import { createPgDatabaseProbe } from '../infrastructure/postgres/pg-database-probe';
import { createApp } from '../interfaces/http/app';
import type { AppBindings } from '../interfaces/http/app-bindings';

/** The wired application, shared by every entry point. */
export interface Container {
  env: Env;
  logger: Logger;
  app: Hono<AppBindings>;
  /** The process-wide connection pool. Entry points that exit (the local server) end it. */
  pool: DbPool;
}

/**
 * Composition root: the only place that reads configuration and wires adapters to ports.
 * Entry points call it once at module load, so warm Lambda invocations reuse every client.
 *
 * @throws Error if the environment is invalid, so a bad deploy fails at cold start.
 */
export function createContainer(source: Readonly<Record<string, string | undefined>>): Container {
  const env = parseEnv(source);
  const logger = createJsonConsoleLogger({ clock: systemClock });
  // One pool per process. Connecting is lazy, so a cold start pays nothing until the first query.
  const pool = createPool({ connectionString: env.DATABASE_URL, logger });
  const app = createApp({
    logger,
    health: {
      llmMode: env.LLM_MODE,
      gitSha: env.GIT_SHA,
      database: createPgDatabaseProbe(pool),
    },
  });
  return { env, logger, app, pool };
}

/** `db/migrations/` at the repository root. Used by the migrate CLI, never by the Lambda bundle. */
const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../../../../db/migrations/', import.meta.url));

/** The migration CLI's dependencies: run once, then close the pool so the process can exit. */
export interface MigrationRunner {
  logger: Logger;
  run(): Promise<MigrationResult>;
  close(): Promise<void>;
}

/**
 * Wires the migrator to the owner connection (`DATABASE_MIGRATION_URL`, ADR 0018).
 *
 * @throws Error if `DATABASE_MIGRATION_URL` is missing or isn't a Postgres URL.
 */
export function createMigrationRunner(
  source: Readonly<Record<string, string | undefined>>,
): MigrationRunner {
  const env = parseMigrationEnv(source);
  const logger = createJsonConsoleLogger({ clock: systemClock });
  const pool = createPool({ connectionString: env.DATABASE_MIGRATION_URL, logger });
  return {
    logger,
    run: async () => migrate(pool, await readMigrations(MIGRATIONS_DIRECTORY)),
    close: () => pool.end(),
  };
}
