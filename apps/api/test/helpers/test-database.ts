import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createPool, type DbPool } from '../../src/infrastructure/postgres/create-pool';
import { migrate, readMigrations } from '../../src/infrastructure/postgres/migrator';
import { RecordingLogger } from '../fakes/recording-logger';

/** The local `npm run db:up` server. CI points `TEST_DATABASE_URL` at its service container. */
const DEFAULT_SERVER_URL = 'postgres://hiresignal:hiresignal@localhost:5433/hiresignal';

/** `db/migrations/` at the repository root. */
export const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../../db/migrations/', import.meta.url),
);

/** A throwaway database that one test file owns. */
export interface TestDatabase {
  /** Pool connected to the throwaway database as the server's owner role. */
  pool: DbPool;
  /** Closes the pool and drops the database. Call it in `afterAll`. */
  drop(): Promise<void>;
}

/**
 * Creates a uniquely named database on the test server, so test files can run in parallel and
 * each starts from a known schema. Migrated by default; pass `{ migrate: false }` to test the
 * migrator itself.
 */
export async function createTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const serverUrl = new URL(process.env.TEST_DATABASE_URL ?? DEFAULT_SERVER_URL);
  const logger = new RecordingLogger();
  const admin = createPool({ connectionString: serverUrl.toString(), logger });
  // A generated identifier of [a-z0-9_] only, so it is safe to interpolate.
  const name = `hs_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`create database ${name}`);

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const pool = createPool({ connectionString: url.toString(), logger });
  if (options.migrate ?? true) {
    await migrate(pool, await readMigrations(MIGRATIONS_DIRECTORY));
  }

  return {
    pool,
    drop: async () => {
      await pool.end();
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
