import { describe, expect, it } from 'vitest';

import { InMemoryLlmCallRepository } from '../../../test/fakes/in-memory-llm-call-repository';
import type { LlmCallRecord } from '../ports/llm-call-repository';
import { withCallTally } from './llm-call-tally';

function call(overrides: Partial<LlmCallRecord> = {}): LlmCallRecord {
  return {
    requestId: null,
    task: 'guard.classify',
    model: 'lite-model',
    tier: 'lite',
    routedReason: 'default',
    isFallback: false,
    source: 'live',
    status: 'ok',
    inputTokens: 900,
    outputTokens: 120,
    cachedTokens: 0,
    latencyMs: 800,
    promptVersion: 'injection-classifier@1',
    createdAt: new Date('2026-10-09T12:00:00Z'),
    ...overrides,
  };
}

describe('withCallTally', () => {
  it('counts attempts, live calls, fallbacks and failures while still logging every call', async () => {
    const inner = new InMemoryLlmCallRepository();
    const { calls, tally } = withCallTally(inner);

    await calls.record(call());
    await calls.record(call({ status: 'rate_limited' }));
    await calls.record(call({ isFallback: true, tier: 'flash', model: 'flash-model' }));
    await calls.record(call({ source: 'replay' }));

    expect(tally()).toEqual({ attempts: 4, live: 3, fallbacks: 1, failed: 1 });
    expect(inner.rows).toHaveLength(4);
  });

  it('delegates the live-call count to the wrapped log', async () => {
    const inner = new InMemoryLlmCallRepository();
    const { calls } = withCallTally(inner);
    await calls.record(call());

    expect(await calls.countLiveSince(new Date('2026-10-09T00:00:00Z'))).toBe(1);
  });

  it('returns a snapshot that later calls do not change', async () => {
    const { calls, tally } = withCallTally(new InMemoryLlmCallRepository());
    const before = tally();

    await calls.record(call());

    expect(before.attempts).toBe(0);
  });
});
