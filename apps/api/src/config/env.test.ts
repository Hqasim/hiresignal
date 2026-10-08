import { describe, expect, it } from 'vitest';

import { parseEnv, parseMigrationEnv } from './env';

const LOCAL_DB = 'postgres://hiresignal:hiresignal@localhost:5433/hiresignal';

function errorMessageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected the action to throw');
}

describe('parseEnv', () => {
  it('applies safe defaults for local development when only the database is set', () => {
    expect(parseEnv({ DATABASE_URL: LOCAL_DB })).toEqual({
      LLM_MODE: 'replay',
      GIT_SHA: 'local',
      PORT: 3000,
      DATABASE_URL: LOCAL_DB,
    });
  });

  it('reads the values a deploy sets', () => {
    const neon =
      'postgresql://app:pw@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=verify-full';

    expect(
      parseEnv({ LLM_MODE: 'live', GIT_SHA: 'abc1234', PORT: '8080', DATABASE_URL: neon }),
    ).toEqual({ LLM_MODE: 'live', GIT_SHA: 'abc1234', PORT: 8080, DATABASE_URL: neon });
  });

  it.each([
    ['an unknown LLM mode', { LLM_MODE: 'mock', DATABASE_URL: LOCAL_DB }, 'LLM_MODE'],
    ['an empty git SHA', { GIT_SHA: '', DATABASE_URL: LOCAL_DB }, 'GIT_SHA'],
    ['a port that is not a number', { PORT: 'http', DATABASE_URL: LOCAL_DB }, 'PORT'],
    ['a missing database URL', {}, 'DATABASE_URL'],
    [
      'a database URL that is not Postgres',
      { DATABASE_URL: 'mysql://localhost/db' },
      'DATABASE_URL',
    ],
  ])('fails fast on %s and names the variable', (_label, source, variable) => {
    expect(() => parseEnv(source)).toThrow(variable);
  });

  it('never echoes the rejected value, because it might be a secret', () => {
    const message = errorMessageOf(() =>
      parseEnv({ LLM_MODE: 'sk-secret-value', DATABASE_URL: 'https://user:hunter2@host/db' }),
    );

    expect(message).toContain('LLM_MODE');
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('sk-secret-value');
    expect(message).not.toContain('hunter2');
  });
});

describe('parseMigrationEnv', () => {
  it('reads the owner connection string', () => {
    expect(parseMigrationEnv({ DATABASE_MIGRATION_URL: LOCAL_DB })).toEqual({
      DATABASE_MIGRATION_URL: LOCAL_DB,
    });
  });

  it('needs nothing else from the runtime environment', () => {
    expect(() =>
      parseMigrationEnv({ DATABASE_MIGRATION_URL: LOCAL_DB, LLM_MODE: 'bogus' }),
    ).not.toThrow();
  });

  it('fails fast without the owner connection string', () => {
    expect(() => parseMigrationEnv({ DATABASE_URL: LOCAL_DB })).toThrow('DATABASE_MIGRATION_URL');
  });
});
