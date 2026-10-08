import { describe, expect, it } from 'vitest';

import { parseEnv, parseMigrationEnv, parseSmokeEnv } from './env';

const LOCAL_DB = 'postgres://hiresignal:hiresignal@localhost:5433/hiresignal';
const MODELS = {
  GEMINI_MODEL_LITE: 'gemini-3.5-flash-lite',
  GEMINI_MODEL_FLASH: 'gemini-3.5-flash',
  GEMINI_EMBEDDING_MODEL: 'gemini-embedding-2',
};
const MINIMAL = { DATABASE_URL: LOCAL_DB, ...MODELS };

function errorMessageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected the action to throw');
}

describe('parseEnv', () => {
  it('applies safe defaults for local development when only the database and models are set', () => {
    expect(parseEnv(MINIMAL)).toEqual({
      LLM_MODE: 'replay',
      GIT_SHA: 'local',
      PORT: 3000,
      DATABASE_URL: LOCAL_DB,
      ...MODELS,
      DAILY_LLM_CALL_CAP: 300,
    });
  });

  it('reads the values a deploy sets', () => {
    const neon =
      'postgresql://app:pw@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=verify-full';

    expect(
      parseEnv({
        ...MODELS,
        LLM_MODE: 'live',
        GIT_SHA: 'abc1234',
        PORT: '8080',
        DATABASE_URL: neon,
        GEMINI_API_KEY: 'test-key',
        DAILY_LLM_CALL_CAP: '150',
      }),
    ).toEqual({
      ...MODELS,
      LLM_MODE: 'live',
      GIT_SHA: 'abc1234',
      PORT: 8080,
      DATABASE_URL: neon,
      GEMINI_API_KEY: 'test-key',
      DAILY_LLM_CALL_CAP: 150,
    });
  });

  it.each([
    ['an unknown LLM mode', { ...MINIMAL, LLM_MODE: 'mock' }, 'LLM_MODE'],
    ['an empty git SHA', { ...MINIMAL, GIT_SHA: '' }, 'GIT_SHA'],
    ['a port that is not a number', { ...MINIMAL, PORT: 'http' }, 'PORT'],
    ['a missing database URL', MODELS, 'DATABASE_URL'],
    [
      'a database URL that is not Postgres',
      { ...MODELS, DATABASE_URL: 'mysql://localhost/db' },
      'DATABASE_URL',
    ],
    ['a missing flash model', { ...MINIMAL, GEMINI_MODEL_FLASH: undefined }, 'GEMINI_MODEL_FLASH'],
    [
      'a model ID with spaces',
      { ...MINIMAL, GEMINI_MODEL_LITE: 'Flash Lite' },
      'GEMINI_MODEL_LITE',
    ],
    ['a negative daily cap', { ...MINIMAL, DAILY_LLM_CALL_CAP: '-1' }, 'DAILY_LLM_CALL_CAP'],
  ])('fails fast on %s and names the variable', (_label, source, variable) => {
    expect(() => parseEnv(source)).toThrow(variable);
  });

  it('never echoes the rejected value, because it might be a secret', () => {
    const message = errorMessageOf(() =>
      parseEnv({
        ...MODELS,
        LLM_MODE: 'sk-secret-value',
        DATABASE_URL: 'https://user:hunter2@host/db',
      }),
    );

    expect(message).toContain('LLM_MODE');
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('sk-secret-value');
    expect(message).not.toContain('hunter2');
  });

  it.each(['live', 'record'])('requires the Gemini key in %s mode', (mode) => {
    expect(() => parseEnv({ ...MINIMAL, LLM_MODE: mode })).toThrow(
      `GEMINI_API_KEY: required when LLM_MODE is ${mode}`,
    );
  });

  it('treats an empty key in .env as unset', () => {
    expect(() => parseEnv({ ...MINIMAL, LLM_MODE: 'live', GEMINI_API_KEY: '' })).toThrow(
      'GEMINI_API_KEY',
    );
  });

  it('needs no Gemini key in replay mode, so CI never has one', () => {
    expect(parseEnv({ ...MINIMAL, LLM_MODE: 'replay' }).GEMINI_API_KEY).toBeUndefined();
  });
});

describe('parseSmokeEnv', () => {
  it('reads the key and the three model IDs, and nothing about the database', () => {
    expect(parseSmokeEnv({ ...MODELS, GEMINI_API_KEY: 'test-key' })).toEqual({
      ...MODELS,
      GEMINI_API_KEY: 'test-key',
    });
  });

  it('fails fast without a key, because the smoke always calls Gemini live', () => {
    expect(() => parseSmokeEnv(MODELS)).toThrow('GEMINI_API_KEY');
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
