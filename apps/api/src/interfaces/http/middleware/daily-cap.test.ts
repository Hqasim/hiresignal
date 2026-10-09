import { PROBLEM_CONTENT_TYPE, ProblemSchema } from '@hiresignal/contracts';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, it } from 'vitest';

import { RecordingLogger } from '../../../../test/fakes/recording-logger';
import { QuotaExceededError } from '../../../application/errors/quota-exceeded-error';
import type { CheckDailyCap } from '../../../application/quota/check-daily-cap';
import type { AppBindings } from '../app-bindings';
import { createErrorHandler } from '../error-handler';
import { dailyCap } from './daily-cap';

function appWith(check: CheckDailyCap) {
  let handled = 0;
  const app = new Hono<AppBindings>();
  app.use(requestId());
  app.onError(createErrorHandler(new RecordingLogger()));
  app.post('/llm', dailyCap(check), (c) => {
    handled += 1;
    return c.json({ ok: true });
  });
  return { app, handled: () => handled };
}

describe('dailyCap', () => {
  it('lets the request through while the cap allows it', async () => {
    const { app, handled } = appWith(() => Promise.resolve());

    const response = await app.request('/llm', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(handled()).toBe(1);
  });

  it('answers 429 problem+json with Retry-After once the cap is used up, without running the handler', async () => {
    const { app, handled } = appWith(() =>
      Promise.reject(new QuotaExceededError('Quota used up.', 3600)),
    );

    const response = await app.request('/llm', { method: 'POST' });

    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    expect(response.headers.get('retry-after')).toBe('3600');
    expect(ProblemSchema.parse(await response.json())).toMatchObject({
      status: 429,
      code: 'QUOTA_EXCEEDED',
      retryAfter: 3600,
    });
    expect(handled()).toBe(0);
  });
});
