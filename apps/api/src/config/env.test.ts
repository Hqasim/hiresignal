import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

function errorMessageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected the action to throw');
}

describe('parseEnv', () => {
  it('applies safe defaults for local development when nothing is set', () => {
    expect(parseEnv({})).toEqual({ LLM_MODE: 'replay', GIT_SHA: 'local', PORT: 3000 });
  });

  it('reads the values a deploy sets', () => {
    expect(parseEnv({ LLM_MODE: 'live', GIT_SHA: 'abc1234', PORT: '8080' })).toEqual({
      LLM_MODE: 'live',
      GIT_SHA: 'abc1234',
      PORT: 8080,
    });
  });

  it.each([
    ['an unknown LLM mode', { LLM_MODE: 'mock' }, 'LLM_MODE'],
    ['an empty git SHA', { GIT_SHA: '' }, 'GIT_SHA'],
    ['a port that is not a number', { PORT: 'http' }, 'PORT'],
  ])('fails fast on %s and names the variable', (_label, source, variable) => {
    expect(() => parseEnv(source)).toThrow(variable);
  });

  it('never echoes the rejected value, because it might be a secret', () => {
    const message = errorMessageOf(() => parseEnv({ LLM_MODE: 'sk-secret-value' }));

    expect(message).toContain('LLM_MODE');
    expect(message).not.toContain('sk-secret-value');
  });
});
