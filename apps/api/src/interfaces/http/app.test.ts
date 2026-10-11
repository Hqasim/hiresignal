import { HealthResponseSchema, PROBLEM_CONTENT_TYPE, ProblemSchema } from '@hiresignal/contracts';
import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../test/fakes/fake-clock';
import { FakeDatabaseProbe } from '../../../test/fakes/fake-database-probe';
import { RecordingLogger } from '../../../test/fakes/recording-logger';
import { aTestApp, UNUSED_RESOURCE_ROUTES } from '../../../test/helpers/test-app';
import { LlmOutputInvalidError } from '../../application/errors';
import { LlmCallError } from '../../application/llm/llm-call-error';
import { createApp, MAX_REQUEST_BODY_BYTES } from './app';

function setup() {
  const logger = new RecordingLogger();
  const clock = new FakeClock();
  const database = new FakeDatabaseProbe();
  const app = createApp({
    logger,
    clock,
    health: { llmMode: 'replay', gitSha: 'abc1234', database },
    ...UNUSED_RESOURCE_ROUTES,
  });
  return { app, logger, clock, database };
}

function errorsIn(logger: RecordingLogger) {
  return logger.entries.filter((entry) => entry.level === 'error');
}

const ASK = '/api/jobs/senior-fullstack-ai/ask';

function postJson(body: string, headers: Record<string, string> = {}): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body };
}

describe('GET /api/health', () => {
  it('reports the database up, the LLM mode and the git SHA in the health contract', async () => {
    const { app } = setup();

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      db: 'up',
      llmMode: 'replay',
      gitSha: 'abc1234',
    });
  });

  it('pings the database on every call, which also wakes Neon from scale-to-zero', async () => {
    const { app, database } = setup();

    await app.request('/api/health');
    await app.request('/api/health');

    expect(database.pings).toBe(2);
  });

  it('stays 200 but reports degraded when the database is unreachable, and logs why', async () => {
    const { app, database, logger } = setup();
    database.failure = new Error('connect ECONNREFUSED 127.0.0.1:5433');

    const response = await app.request('/api/health', { headers: { 'x-request-id': 'req-db' } });

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toMatchObject({
      status: 'degraded',
      db: 'down',
    });
    expect(errorsIn(logger)).toEqual([
      {
        level: 'error',
        event: 'health.db_unreachable',
        error: database.failure,
        fields: { requestId: 'req-db' },
      },
    ]);
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
    expect(errorsIn(logger)).toEqual([
      expect.objectContaining({ level: 'error', event: 'http.unhandled_error' }),
    ]);
  });

  it('render a 5xx application error with its own code and log it with that code', async () => {
    const { app, logger } = setup();
    app.get('/api/invalid', () => {
      throw new LlmOutputInvalidError('The model reply did not match the schema twice.');
    });

    const response = await app.request('/api/invalid', { headers: { 'x-request-id': 'req-502' } });

    expect(response.status).toBe(502);
    expect(ProblemSchema.parse(await response.json()).code).toBe('LLM_OUTPUT_INVALID');
    expect(errorsIn(logger)).toEqual([
      expect.objectContaining({
        event: 'http.request_failed',
        fields: { requestId: 'req-502', code: 'LLM_OUTPUT_INVALID' },
      }),
    ]);
  });
});

describe('model provider failures that escape the decorators', () => {
  it('answer 503 LLM_UNAVAILABLE when the question embedding is rate limited', async () => {
    const { app, world, llm } = await aTestApp();
    world.embedder.queryFailure = new LlmCallError('Gemini rate limited embed.query', {
      reason: 'rate_limited',
      task: 'embed.query',
    });

    const response = await app.request(
      ASK,
      postJson(JSON.stringify({ question: 'Who has built React dashboards?' })),
    );

    expect(response.status).toBe(503);
    const problem = ProblemSchema.parse(await response.json());
    expect(problem).toMatchObject({ code: 'LLM_UNAVAILABLE', status: 503 });
    expect(problem.detail).not.toContain('Gemini');
    expect(llm.requests).toHaveLength(0);
  });

  it('treat a rejected provider call as a bug: a generic 500', async () => {
    const { app, world, logger } = await aTestApp();
    world.embedder.queryFailure = new LlmCallError('Gemini rejected embed.query', {
      reason: 'rejected',
      task: 'embed.query',
    });

    const response = await app.request(
      ASK,
      postJson(JSON.stringify({ question: 'Who has built React dashboards?' })),
    );

    expect(response.status).toBe(500);
    expect(ProblemSchema.parse(await response.json()).code).toBe('INTERNAL_ERROR');
    expect(errorsIn(logger).map((entry) => entry.event)).toEqual(['http.unhandled_error']);
  });
});

describe('request body limit', () => {
  /** A JSON body of exactly `bytes` bytes, whose question is far over 500 characters. */
  function bodyOf(bytes: number): string {
    const frame = '{"question":""}';
    return `{"question":"${'x'.repeat(bytes - frame.length)}"}`;
  }

  /** `content-length` when asked for; without it, the body limit counts the streamed bytes. */
  function lengthHeader(body: string, withLength: boolean): Record<string, string> {
    return withLength ? { 'content-length': String(body.length) } : {};
  }

  it.each([
    ['with a content-length header', true],
    ['streamed without one', false],
  ])('accepts exactly 16 KB %s, so the 400 comes from validation', async (_case, withLength) => {
    const { app } = await aTestApp();
    const body = bodyOf(MAX_REQUEST_BODY_BYTES);

    const response = await app.request(ASK, postJson(body, lengthHeader(body, withLength)));

    expect(response.status).toBe(400);
    expect(ProblemSchema.parse(await response.json()).code).toBe('VALIDATION_FAILED');
  });

  it.each([
    ['with a content-length header', true],
    ['streamed without one', false],
  ])('refuses one byte more with a 413 problem, %s', async (_case, withLength) => {
    const { app, world } = await aTestApp();
    const body = bodyOf(MAX_REQUEST_BODY_BYTES + 1);

    const response = await app.request(ASK, postJson(body, lengthHeader(body, withLength)));

    expect(response.status).toBe(413);
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    expect(ProblemSchema.parse(await response.json())).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
      detail: 'The request body exceeds 16384 bytes.',
    });
    expect(world.embedder.queries).toHaveLength(0);
  });
});

describe('access log', () => {
  it('logs one line per request with the route pattern, status and duration, nothing else', async () => {
    const { app, logger, clock } = setup();
    app.get('/api/things/:id', (c) => {
      clock.advance(42);
      return c.json({ ok: true });
    });

    await app.request('/api/things/secret-id?q=who+knows+go', {
      headers: { 'x-request-id': 'req-log' },
    });

    expect(logger.entries).toEqual([
      {
        level: 'info',
        event: 'http.request',
        fields: {
          requestId: 'req-log',
          method: 'GET',
          route: '/api/things/:id',
          status: 200,
          durationMs: 42,
        },
      },
    ]);
  });

  it('records the status of a request the error handler answered', async () => {
    const { app, logger } = setup();

    await app.request('/api/nope/typed-by-a-user');

    const [entry] = logger.entries;
    expect(entry).toMatchObject({ event: 'http.request', fields: { status: 404 } });
    expect(JSON.stringify(entry)).not.toContain('typed-by-a-user');
  });
});
