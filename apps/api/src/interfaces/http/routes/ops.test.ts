import { LlmCallListResponseSchema, OpsSummarySchema, ProblemSchema } from '@hiresignal/contracts';
import { describe, expect, it } from 'vitest';

import { aTestApp } from '../../../../test/helpers/test-app';
import type { LlmCallRecord } from '../../../application/ports/llm-call-repository';

/** The test app's clock reads 2026-10-09T15:00:00Z. */
function call(createdAt: string, overrides: Partial<LlmCallRecord> = {}): LlmCallRecord {
  return {
    requestId: 'req-1',
    task: 'ask.answer',
    model: 'lite-model',
    tier: 'lite',
    routedReason: 'default',
    isFallback: false,
    source: 'live',
    status: 'ok',
    inputTokens: 1000,
    outputTokens: 100,
    cachedTokens: 400,
    latencyMs: 600,
    promptVersion: 'ask@1',
    createdAt: new Date(createdAt),
    ...overrides,
  };
}

describe('GET /api/ops/summary', () => {
  it("reports today's calls against the cap, by model and route, in the contract shape", async () => {
    const { app, calls } = await aTestApp({ cap: 300 });
    calls.rows.push(
      call('2026-10-08T23:00:00Z', { latencyMs: 99_999 }),
      call('2026-10-09T08:00:00Z', { latencyMs: 400 }),
      call('2026-10-09T09:00:00Z', {
        model: 'flash-model',
        tier: 'flash',
        routedReason: 'comparative-intent',
        latencyMs: 1200,
        cachedTokens: 0,
      }),
      call('2026-10-09T10:00:00Z', {
        status: 'rate_limited',
        latencyMs: 200,
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
      }),
      call('2026-10-09T11:00:00Z', { source: 'replay', latencyMs: 1 }),
    );

    const response = await app.request('/api/ops/summary');

    expect(response.status).toBe(200);
    const body = OpsSummarySchema.parse(await response.json());
    expect(body).toMatchObject({
      day: '2026-10-09',
      generatedAt: '2026-10-09T15:00:00.000Z',
      cap: { used: 3, limit: 300, resetsAt: '2026-10-10T00:00:00.000Z' },
      totals: {
        calls: 4,
        live: 3,
        replay: 1,
        errors: 1,
        inputTokens: 2000,
        cachedTokens: 400,
        cacheRatio: 0.2,
        p50LatencyMs: 400,
      },
      routeMix: [
        { tier: 'lite', routedReason: 'default', calls: 3 },
        { tier: 'flash', routedReason: 'comparative-intent', calls: 1 },
      ],
    });
    expect(body.byModel.map((model) => [model.model, model.calls])).toEqual([
      ['flash-model', 1],
      ['lite-model', 3],
    ]);
  });

  it('answers a quiet day with zeros and nulls, never an error', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/ops/summary');

    expect(response.status).toBe(200);
    const body = OpsSummarySchema.parse(await response.json());
    expect(body.totals).toMatchObject({ calls: 0, cacheRatio: null, p95LatencyMs: null });
    expect(body.byModel).toEqual([]);
  });

  it('is not behind the daily cap: it still answers once the cap is used up', async () => {
    const { app, calls } = await aTestApp({ cap: 1 });
    calls.rows.push(call('2026-10-09T08:00:00Z'));

    const response = await app.request('/api/ops/summary');

    expect(response.status).toBe(200);
    expect(OpsSummarySchema.parse(await response.json()).cap).toMatchObject({ used: 1, limit: 1 });
  });
});

describe('GET /api/ops/calls', () => {
  it('lists recent calls newest first, as metadata only', async () => {
    const { app, calls } = await aTestApp();
    calls.rows.push(
      call('2026-10-09T08:00:00Z', { latencyMs: 1 }),
      call('2026-10-09T10:00:00Z', { latencyMs: 3, task: 'embed.query', tier: 'embedding' }),
      call('2026-10-09T09:00:00Z', { latencyMs: 2 }),
    );

    const response = await app.request('/api/ops/calls');

    expect(response.status).toBe(200);
    const { calls: rows } = LlmCallListResponseSchema.parse(await response.json());
    expect(rows.map((row) => row.latencyMs)).toEqual([3, 2, 1]);
    expect(rows[0]).toEqual({
      id: 2,
      requestId: 'req-1',
      task: 'embed.query',
      model: 'lite-model',
      tier: 'embedding',
      routedReason: 'default',
      isFallback: false,
      source: 'live',
      status: 'ok',
      inputTokens: 1000,
      outputTokens: 100,
      cachedTokens: 400,
      latencyMs: 3,
      promptVersion: 'ask@1',
      createdAt: '2026-10-09T10:00:00.000Z',
    });
  });

  it('stops at ?limit=', async () => {
    const { app, calls } = await aTestApp();
    calls.rows.push(call('2026-10-09T08:00:00Z'), call('2026-10-09T09:00:00Z'));

    const response = await app.request('/api/ops/calls?limit=1');

    expect(LlmCallListResponseSchema.parse(await response.json()).calls).toHaveLength(1);
  });

  it.each(['0', '101', 'all'])('rejects ?limit=%s with a 400 problem', async (limit) => {
    const { app } = await aTestApp();

    const response = await app.request(`/api/ops/calls?limit=${limit}`);

    expect(response.status).toBe(400);
    expect(ProblemSchema.parse(await response.json())).toMatchObject({
      code: 'VALIDATION_FAILED',
      detail: 'Invalid query parameter: limit.',
    });
  });
});
