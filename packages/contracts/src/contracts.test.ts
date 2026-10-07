import { describe, expect, it } from 'vitest';

import { HealthResponseSchema, ProblemSchema } from './index';

describe('HealthResponseSchema', () => {
  it('accepts a healthy response before the database is wired', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      db: 'unchecked',
      llmMode: 'replay',
      gitSha: 'abc1234',
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['an unknown LLM mode', { status: 'ok', db: 'up', llmMode: 'mock', gitSha: 'abc' }],
    ['an empty git SHA', { status: 'ok', db: 'up', llmMode: 'live', gitSha: '' }],
    ['a missing db status', { status: 'ok', llmMode: 'live', gitSha: 'abc' }],
  ])('rejects %s', (_label, payload) => {
    expect(HealthResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe('ProblemSchema', () => {
  const problem = {
    type: 'urn:hiresignal:problem:not-found',
    title: 'Not Found',
    status: 404,
    detail: 'No route matches GET /api/nope.',
    instance: '/api/nope',
    code: 'NOT_FOUND',
    requestId: 'req-1',
  };

  it('accepts an RFC 9457 problem with a stable code and request id', () => {
    expect(ProblemSchema.safeParse(problem).success).toBe(true);
  });

  it.each([
    ['a success status', { ...problem, status: 200 }],
    ['a lower-case code', { ...problem, code: 'not_found' }],
    ['a missing request id', { ...problem, requestId: '' }],
  ])('rejects %s', (_label, payload) => {
    expect(ProblemSchema.safeParse(payload).success).toBe(false);
  });
});
