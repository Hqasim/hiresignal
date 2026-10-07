import { HealthResponseSchema, PROBLEM_CONTENT_TYPE, ProblemSchema } from '@hiresignal/contracts';
import { describe, expect, it } from 'vitest';

import { RecordingLogger } from '../../../test/fakes/recording-logger';
import { createApp } from './app';

function setup() {
  const logger = new RecordingLogger();
  const app = createApp({ logger, health: { llmMode: 'replay', gitSha: 'abc1234' } });
  return { app, logger };
}

describe('GET /api/health', () => {
  it('reports the LLM mode and git SHA in the health contract', async () => {
    const { app } = setup();

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      db: 'unchecked',
      llmMode: 'replay',
      gitSha: 'abc1234',
    });
  });

  it('tags every response with an x-request-id', async () => {
    const { app } = setup();

    const response = await app.request('/api/health');

    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed request id from the caller so logs can be correlated', async () => {
    const { app } = setup();

    const response = await app.request('/api/health', { headers: { 'x-request-id': 'trace-42' } });

    expect(response.headers.get('x-request-id')).toBe('trace-42');
  });
});

describe('unknown routes', () => {
  it('answer 404 with problem+json whose requestId matches the header', async () => {
    const { app } = setup();

    const response = await app.request('/api/nope');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    const problem = ProblemSchema.parse(await response.json());
    expect(problem).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      instance: '/api/nope',
      type: 'urn:hiresignal:problem:not-found',
    });
    expect(problem.requestId).toBe(response.headers.get('x-request-id'));
  });
});

describe('unexpected errors', () => {
  it('return a generic 500 problem without leaking the message or stack, and log the error', async () => {
    const { app, logger } = setup();
    app.get('/api/boom', () => {
      throw new Error('database password is hunter2');
    });

    const response = await app.request('/api/boom');

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain('hunter2');
    expect(body).not.toContain('at ');
    expect(ProblemSchema.parse(JSON.parse(body))).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(logger.entries).toEqual([
      expect.objectContaining({ level: 'error', event: 'http.unhandled_error' }),
    ]);
  });
});
