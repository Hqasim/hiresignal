import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../test/fakes/fake-clock';
import { InMemoryLlmCallRepository } from '../../../test/fakes/in-memory-llm-call-repository';
import type { LlmCallRecord } from '../ports/llm-call-repository';
import { createGetOpsSummary } from './get-ops-summary';
import { createListRecentCalls } from './list-recent-calls';

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
    cachedTokens: 250,
    latencyMs: 500,
    promptVersion: 'ask@1',
    createdAt: new Date(createdAt),
    ...overrides,
  };
}

function setup(rows: LlmCallRecord[]) {
  const calls = new InMemoryLlmCallRepository();
  calls.rows.push(...rows);
  const clock = new FakeClock(new Date('2026-10-11T15:00:00.000Z'));
  return { calls, clock };
}

describe('createGetOpsSummary', () => {
  it("summarizes today's UTC day only, and reports live calls against the cap", async () => {
    const { calls, clock } = setup([
      call('2026-10-10T23:59:59.999Z'),
      call('2026-10-11T00:00:00.000Z'),
      call('2026-10-11T09:00:00.000Z', { source: 'replay' }),
      call('2026-10-11T14:00:00.000Z', { model: 'flash-model', tier: 'flash', latencyMs: 900 }),
    ]);

    const report = await createGetOpsSummary({ calls, clock, cap: 300 })();

    expect(report.day).toEqual(new Date('2026-10-11T00:00:00.000Z'));
    expect(report.generatedAt).toEqual(new Date('2026-10-11T15:00:00.000Z'));
    expect(report.cap).toEqual({
      used: 2,
      limit: 300,
      resetsAt: new Date('2026-10-12T00:00:00.000Z'),
    });
    expect(report.calls.totals).toMatchObject({ calls: 3, live: 2, replay: 1, cacheRatio: 0.25 });
    expect(report.calls.byModel.map((model) => model.model)).toEqual(['flash-model', 'lite-model']);
  });

  it('reports a quiet day as zeros, with nothing to measure latency on', async () => {
    const { calls, clock } = setup([]);

    const report = await createGetOpsSummary({ calls, clock, cap: 300 })();

    expect(report.cap.used).toBe(0);
    expect(report.calls.totals).toMatchObject({ calls: 0, p50LatencyMs: null, cacheRatio: null });
  });
});

describe('createListRecentCalls', () => {
  it('lists the newest calls first, up to the limit', async () => {
    const { calls } = setup([
      call('2026-10-11T09:00:00.000Z', { latencyMs: 1 }),
      call('2026-10-11T11:00:00.000Z', { latencyMs: 3 }),
      call('2026-10-11T10:00:00.000Z', { latencyMs: 2 }),
    ]);

    const recent = await createListRecentCalls({ calls })({ limit: 2 });

    expect(recent.map((row) => row.latencyMs)).toEqual([3, 2]);
  });
});
