import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPool } from '../../src/infrastructure/postgres/create-pool';
import {
  migrate,
  type Migration,
  MigrationHistoryError,
  readMigrations,
} from '../../src/infrastructure/postgres/migrator';
import { RecordingLogger } from '../fakes/recording-logger';
import {
  createTestDatabase,
  MIGRATIONS_DIRECTORY,
  type TestDatabase,
} from '../helpers/test-database';

const APP_ROLE = 'hiresignal_app';

let migrations: Migration[];

beforeAll(async () => {
  migrations = await readMigrations(MIGRATIONS_DIRECTORY);
});

describe('migrations on an empty database', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase({ migrate: false });
  });
  afterAll(async () => {
    await db.drop();
  });

  it('apply every file in order the first time', async () => {
    const result = await migrate(db.pool, migrations);

    expect(result).toEqual({ applied: ['0001_init', '0002_app_role_grants'], skipped: [] });
  });

  it('apply nothing the second time', async () => {
    const result = await migrate(db.pool, migrations);

    expect(result).toEqual({ applied: [], skipped: ['0001_init', '0002_app_role_grants'] });
  });

  it('create the pgvector extension and the search indexes', async () => {
    const { rows } = await db.pool.query<{ name: string }>(`
      select extname::text as name from pg_extension where extname = 'vector'
      union all
      select indexname::text from pg_indexes
      where indexname in ('resume_chunks_embedding_hnsw', 'resume_chunks_tsv_gin')
      order by name`);

    expect(rows.map((row) => row.name)).toEqual([
      'resume_chunks_embedding_hnsw',
      'resume_chunks_tsv_gin',
      'vector',
    ]);
  });

  it('refuse to run when an applied migration was edited', async () => {
    const edited = migrations.map((migration) =>
      migration.version === '0001_init' ? { ...migration, checksum: 'edited' } : migration,
    );

    await expect(migrate(db.pool, edited)).rejects.toThrow(MigrationHistoryError);
  });

  it('refuse to run when an applied migration file is missing', async () => {
    await expect(migrate(db.pool, migrations.slice(1))).rejects.toThrow(/0001_init.*missing/);
  });
});

describe('a migration that fails', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase({ migrate: false });
  });
  afterAll(async () => {
    await db.drop();
  });

  it('leaves no trace, so the next run retries it', async () => {
    const broken: Migration = {
      version: '0001_broken',
      sql: 'create table half_done (x int); select 1/0;',
      checksum: 'x',
    };

    await expect(migrate(db.pool, [broken])).rejects.toThrow('division by zero');

    const { rows } = await db.pool.query<{ tables: number; recorded: number }>(`
      select (select count(*)::int from pg_tables where tablename = 'half_done') as tables,
             (select count(*)::int from schema_migrations) as recorded`);
    expect(rows[0]).toEqual({ tables: 0, recorded: 0 });
  });
});

describe('the least-privilege app role', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase({ migrate: false });
    // Roles are cluster-wide. Create it before migrating, as the runbook says to do on Neon.
    await db.pool.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = '${APP_ROLE}') then
          create role ${APP_ROLE};
        end if;
      end $$`);
    await migrate(db.pool, migrations);
  });
  afterAll(async () => {
    await db.drop();
  });

  /** Runs `sql` as the app role inside a transaction that is always rolled back. */
  async function asAppRole(sql: string): Promise<void> {
    const client = await db.pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role ${APP_ROLE}`);
      await client.query(sql);
    } finally {
      await client.query('rollback');
      client.release();
    }
  }

  it('can read, insert and update rows', async () => {
    await expect(
      asAppRole(`
        insert into jobs (slug, title, company, description, requirements)
          values ('grant-check', 't', 'c', 'd', '[]');
        update jobs set title = 'u' where slug = 'grant-check';
        insert into llm_calls (task, model, tier, routed_reason, source, status, latency_ms)
          values ('guard.classify', 'm', 'lite', 'default', 'replay', 'ok', 1);
        select count(*) from candidates;`),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['delete rows', 'delete from jobs'],
    ['create a table', 'create table app_owned (x int)'],
    ['drop a table', 'drop table llm_calls'],
  ])('cannot %s', async (_label, sql) => {
    await expect(asAppRole(sql)).rejects.toThrow(/permission denied|must be owner/);
  });
});

describe('the pool', () => {
  it('reports a connection failure to the caller instead of crashing the process', async () => {
    const pool = createPool({
      connectionString: 'postgres://nobody:nothing@127.0.0.1:1/none',
      logger: new RecordingLogger(),
    });

    await expect(pool.query('select 1')).rejects.toThrow();
    await pool.end();
  });
});
