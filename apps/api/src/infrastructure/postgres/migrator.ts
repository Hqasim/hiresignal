import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { DbPool } from './create-pool';
import { queryRows } from './query-rows';
import { withTransaction } from './transaction';

/** One SQL file from `db/migrations/`. */
export interface Migration {
  /** File name without `.sql`, for example `0001_init`. Sorts in apply order. */
  version: string;
  sql: string;
  /** sha256 of the file with line endings normalized to LF. */
  checksum: string;
}

/** What one run of the migrator did. */
export interface MigrationResult {
  /** Versions applied by this run, in order. */
  applied: string[];
  /** Versions that were already applied and were skipped. */
  skipped: string[];
}

/** Raised when the migration history and the files on disk disagree. Nothing is applied. */
export class MigrationHistoryError extends Error {
  override readonly name = 'MigrationHistoryError';
}

/** `NNNN_snake_case.sql`. Anything else in the folder is ignored. */
const MIGRATION_FILE = /^(\d{4}_[a-z0-9_]+)\.sql$/;

/**
 * Key for the session-level advisory lock that serializes concurrent runs (two deploys, or CI
 * jobs sharing a database). Any fixed number works; this one spells "hiresi" in ASCII and stays
 * below `Number.MAX_SAFE_INTEGER`, so it travels as a plain number parameter.
 */
const MIGRATION_LOCK_KEY = 0x68_69_72_65_73_69;

const AppliedRowSchema = z.object({ version: z.string(), checksum: z.string() });

/**
 * Loads every migration file in `directory`, sorted by version.
 *
 * @example
 * const migrations = await readMigrations('db/migrations'); // [{ version: '0001_init', … }, …]
 */
export async function readMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) => MIGRATION_FILE.test(name)).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = (await readFile(join(directory, name), 'utf8')).replaceAll('\r\n', '\n');
      return {
        version: name.slice(0, -'.sql'.length),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

/**
 * Applies pending migrations in version order (ADR 0018).
 *
 * - Holds an advisory lock for the whole run, so concurrent runs queue instead of racing. It's a
 *   session lock, so run this against a direct connection, not a transaction-mode pooler.
 * - Applies each file in its own transaction and records it in `schema_migrations` in that same
 *   transaction, so a failed file leaves no trace and the next run retries it.
 * - Refuses to run if an applied file was edited or deleted: migrations are forward-only.
 *
 * @throws MigrationHistoryError if the recorded history doesn't match `migrations`.
 */
export async function migrate(
  pool: DbPool,
  migrations: readonly Migration[],
): Promise<MigrationResult> {
  const lock = await pool.connect();
  try {
    await lock.query('select pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_KEY]);
    await lock.query(`
      create table if not exists schema_migrations (
        version     text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      )`);
    const history = await queryRows(
      lock,
      'select version, checksum from schema_migrations order by version',
      [],
      AppliedRowSchema,
    );
    checkHistory(history, migrations);

    const appliedBefore = new Set(history.map((row) => row.version));
    const result: MigrationResult = { applied: [], skipped: [] };
    for (const migration of migrations) {
      if (appliedBefore.has(migration.version)) {
        result.skipped.push(migration.version);
        continue;
      }
      await withTransaction(pool, async (tx) => {
        await tx.query(migration.sql);
        await tx.query('insert into schema_migrations (version, checksum) values ($1, $2)', [
          migration.version,
          migration.checksum,
        ]);
      });
      result.applied.push(migration.version);
    }
    return result;
  } finally {
    await lock.query('select pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_KEY]);
    lock.release();
  }
}

function checkHistory(
  history: readonly z.infer<typeof AppliedRowSchema>[],
  migrations: readonly Migration[],
): void {
  const onDisk = new Map(migrations.map((migration) => [migration.version, migration.checksum]));
  for (const row of history) {
    const checksum = onDisk.get(row.version);
    if (checksum === undefined) {
      throw new MigrationHistoryError(
        `Migration ${row.version} was applied but its file is missing. Restore it; migrations are forward-only.`,
      );
    }
    if (checksum !== row.checksum) {
      throw new MigrationHistoryError(
        `Migration ${row.version} changed after it was applied. Revert the edit and add a new migration instead.`,
      );
    }
  }
}
