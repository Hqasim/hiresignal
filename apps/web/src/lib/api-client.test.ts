import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw-server';
import { aProblem, problemResponse, QUOTA_PROBLEM } from '@/test/problems';

import { ApiError, apiGet, apiPost, isQuotaExceeded, type ResponseSchema } from './api-client';

/** A hand-written schema, so the test needs no Zod: the client accepts anything with `parse`. */
const EchoSchema: ResponseSchema<{ echo: string }> = {
  parse(input) {
    if (
      typeof input === 'object' &&
      input !== null &&
      'echo' in input &&
      typeof input.echo === 'string'
    ) {
      return { echo: input.echo };
    }
    throw new Error('not an echo');
  },
};

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('apiPost', () => {
  it('sends the body as JSON and returns the validated response', async () => {
    server.use(
      http.post('*/api/echo', async ({ request }) => {
        const body = (await request.json()) as { question: string };
        return HttpResponse.json({
          echo: `${request.headers.get('content-type') ?? ''} ${body.question}`,
        });
      }),
    );

    await expect(apiPost('/api/echo', EchoSchema, { question: 'hi' })).resolves.toEqual({
      echo: 'application/json hi',
    });
  });

  it('sends no body and no content type when there is nothing to send', async () => {
    server.use(
      http.post('*/api/echo', async ({ request }) =>
        HttpResponse.json({
          echo: `${request.headers.get('content-type') ?? 'none'}|${await request.text()}`,
        }),
      ),
    );

    await expect(apiPost('/api/echo', EchoSchema)).resolves.toEqual({ echo: 'none|' });
  });

  it('turns a 429 problem into a quota error that carries retryAfter', async () => {
    server.use(http.post('*/api/echo', () => problemResponse(QUOTA_PROBLEM)));

    const error = await caught(apiPost('/api/echo', EchoSchema, {}));

    expect(isQuotaExceeded(error)).toBe(true);
    expect(error).toMatchObject({ status: 429, retryAfter: 3600, detail: QUOTA_PROBLEM.detail });
  });

  it('keeps the problem detail and request id of any other error', async () => {
    const problem = aProblem({ status: 422, code: 'INJECTION_REJECTED', detail: 'Rejected.' });
    server.use(http.post('*/api/echo', () => problemResponse(problem)));

    const error = await caught(apiPost('/api/echo', EchoSchema, {}));

    expect(isQuotaExceeded(error)).toBe(false);
    expect(error).toMatchObject({ code: 'INJECTION_REJECTED', requestId: 'req-test' });
    expect(error.retryAfter).toBeNull();
  });
});

describe('apiGet', () => {
  it('reports a network failure as NETWORK_ERROR with status 0', async () => {
    server.use(http.get('*/api/echo', () => HttpResponse.error()));

    const error = await caught(apiGet('/api/echo', EchoSchema));

    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('reports an error without a problem body by its HTTP status', async () => {
    server.use(http.get('*/api/echo', () => new HttpResponse('gateway', { status: 502 })));

    const error = await caught(apiGet('/api/echo', EchoSchema));

    expect(error).toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      detail: 'The API answered with HTTP 502.',
    });
  });

  it('rejects a 200 that breaks the contract', async () => {
    server.use(http.get('*/api/echo', () => HttpResponse.json({ echo: 42 })));

    const error = await caught(apiGet('/api/echo', EchoSchema));

    expect(error.code).toBe('CONTRACT_MISMATCH');
  });
});

describe('isQuotaExceeded', () => {
  it('is false for anything that is not an ApiError', () => {
    expect(isQuotaExceeded(new Error('QUOTA_EXCEEDED'))).toBe(false);
  });
});
