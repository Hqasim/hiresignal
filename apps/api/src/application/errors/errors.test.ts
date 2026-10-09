import { describe, expect, it } from 'vitest';

import { LlmCallError } from '../llm/llm-call-error';
import {
  type AppError,
  CandidateQuarantinedError,
  FixtureMissingError,
  InjectionRejectedError,
  LlmOutputInvalidError,
  LlmUnavailableError,
  NotFoundError,
  QuotaExceededError,
} from '.';

describe('application errors', () => {
  it.each<[string, AppError, string, number]>([
    ['NotFoundError', new NotFoundError('x'), 'NOT_FOUND', 404],
    ['QuotaExceededError', new QuotaExceededError('x', 60), 'QUOTA_EXCEEDED', 429],
    ['CandidateQuarantinedError', new CandidateQuarantinedError('x'), 'CANDIDATE_QUARANTINED', 409],
    ['LlmUnavailableError', new LlmUnavailableError('x'), 'LLM_UNAVAILABLE', 503],
    ['LlmOutputInvalidError', new LlmOutputInvalidError('x'), 'LLM_OUTPUT_INVALID', 502],
    ['FixtureMissingError', new FixtureMissingError('guard.classify'), 'FIXTURE_MISSING', 500],
    ['InjectionRejectedError', new InjectionRejectedError('x'), 'INJECTION_REJECTED', 422],
  ])('%s maps to a stable code and status', (name, error, code, status) => {
    expect(error.name).toBe(name);
    expect(error.code).toBe(code);
    expect(error.httpStatus).toBe(status);
  });

  it('tells the developer to re-record seed fixtures when one is missing', () => {
    expect(new FixtureMissingError('screen.agent').detail).toBe(
      'No recorded response for screen.agent. Run `npm run seed:record` (needs GEMINI_API_KEY).',
    );
  });

  it('points at llm:smoke for a missing smoke fixture', () => {
    expect(new FixtureMissingError('platform.smoke').detail).toContain('`npm run llm:smoke`');
  });
});

describe('LlmCallError', () => {
  it.each([
    ['rate_limited', true],
    ['unavailable', true],
    ['timeout', true],
    ['rejected', false],
  ] as const)('treats %s as retryable: %s', (reason, retryable) => {
    const error = new LlmCallError('failed', { reason, task: 'ask.answer' });

    expect(error.retryable).toBe(retryable);
  });

  it('keeps the server-requested delay and the cause', () => {
    const cause = new Error('429');
    const error = new LlmCallError('rate limited', {
      reason: 'rate_limited',
      task: 'embed.query',
      retryAfterMs: 30_000,
      cause,
    });

    expect(error.retryAfterMs).toBe(30_000);
    expect(error.cause).toBe(cause);
  });
});
