import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';

import { toLlmCallError } from './gemini-errors';

function rateLimitBody(retryDelay: string): string {
  return JSON.stringify({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure' },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
      ],
    },
  });
}

describe('toLlmCallError', () => {
  it.each([
    [429, 'rate_limited'],
    [408, 'timeout'],
    [500, 'unavailable'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [504, 'unavailable'],
    [400, 'rejected'],
    [403, 'rejected'],
    [404, 'rejected'],
  ])('maps HTTP %i to %s', (status, reason) => {
    const error = toLlmCallError(new ApiError({ message: '{}', status }), 'ask.answer');

    expect(error.reason).toBe(reason);
    expect(error.message).toBe(`Gemini returned HTTP ${String(status)} for ask.answer`);
  });

  it.each([
    ['37s', 37_000],
    ['1.5s', 1500],
    ['0s', 0],
  ])('reads the server-requested delay %s from a 429 body', (retryDelay, expectedMs) => {
    const error = toLlmCallError(
      new ApiError({ message: rateLimitBody(retryDelay), status: 429 }),
      'guard.classify',
    );

    expect(error.retryAfterMs).toBe(expectedMs);
  });

  it.each([
    ['a body that is not JSON', 'Too many requests'],
    ['a body without RetryInfo', JSON.stringify({ error: { details: [] } })],
    ['a delay in an unexpected format', rateLimitBody('soon')],
  ])('leaves the delay unset for %s', (_label, message) => {
    const error = toLlmCallError(new ApiError({ message, status: 429 }), 'guard.classify');

    expect(error.reason).toBe('rate_limited');
    expect(error.retryAfterMs).toBeUndefined();
  });

  it.each(['AbortError', 'TimeoutError'])('treats a %s as a timeout', (name) => {
    const aborted = new DOMException('The operation was aborted.', name);

    expect(toLlmCallError(aborted, 'screen.agent').reason).toBe('timeout');
  });

  it('treats a network failure before any response as unavailable', () => {
    expect(toLlmCallError(new TypeError('fetch failed'), 'screen.agent').reason).toBe(
      'unavailable',
    );
  });

  it('treats anything else as a rejected call and keeps it as the cause', () => {
    const unknown = new Error('unexpected');

    const error = toLlmCallError(unknown, 'embed.query');

    expect(error.reason).toBe('rejected');
    expect(error.cause).toBe(unknown);
  });
});
