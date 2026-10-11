import { describe, expect, it } from 'vitest';

import { LlmCallRowSchema, OpsSummarySchema } from './index';

const stats = {
  calls: 3,
  live: 2,
  replay: 1,
  errors: 0,
  fallbacks: 0,
  inputTokens: 900,
  outputTokens: 120,
  cachedTokens: 450,
  cacheRatio: 0.5,
  p50LatencyMs: 640,
  p95LatencyMs: 1210.5,
};

const summary = {
  day: '2026-10-11',
  generatedAt: '2026-10-11T15:00:00.000Z',
  cap: { used: 2, limit: 300, resetsAt: '2026-10-12T00:00:00.000Z' },
  totals: stats,
  byModel: [{ ...stats, model: 'gemini-3.5-flash-lite', tier: 'lite' }],
  routeMix: [{ tier: 'lite', routedReason: 'default', calls: 2 }],
};

const row = {
  id: 7,
  requestId: 'req-1',
  task: 'ask.answer',
  model: 'gemini-3.5-flash-lite',
  tier: 'lite',
  routedReason: 'default',
  isFallback: false,
  source: 'live',
  status: 'ok',
  inputTokens: 900,
  outputTokens: 120,
  cachedTokens: null,
  latencyMs: 640,
  promptVersion: 'ask@1',
  createdAt: '2026-10-11T14:59:00.000Z',
};

describe('OpsSummarySchema', () => {
  it('accepts a day of telemetry', () => {
    expect(OpsSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('accepts an empty day: zeros, and nulls where nothing can be measured', () => {
    const empty = { ...stats, calls: 0, live: 0, replay: 0, inputTokens: 0, outputTokens: 0 };
    const quiet = {
      ...summary,
      totals: {
        ...empty,
        cachedTokens: 0,
        cacheRatio: null,
        p50LatencyMs: null,
        p95LatencyMs: null,
      },
      byModel: [],
      routeMix: [],
    };

    expect(OpsSummarySchema.safeParse(quiet).success).toBe(true);
  });

  it.each([
    ['a cache ratio over 1', { ...summary, totals: { ...stats, cacheRatio: 1.2 } }],
    ['a day with a time', { ...summary, day: '2026-10-11T00:00:00Z' }],
    [
      'an embedding route',
      { ...summary, routeMix: [{ tier: 'embedding', routedReason: 'default', calls: 1 }] },
    ],
    ['an extra field', { ...summary, prompt: 'leaked' }],
  ])('rejects %s', (_label, payload) => {
    expect(OpsSummarySchema.safeParse(payload).success).toBe(false);
  });
});

describe('LlmCallRowSchema', () => {
  it('accepts call metadata', () => {
    expect(LlmCallRowSchema.safeParse(row).success).toBe(true);
  });

  it.each([
    ['content', { ...row, content: 'Who knows Go?' }],
    ['question', { ...row, question: 'Who knows Go?' }],
  ])('rejects a row carrying %s, so content never reaches the ops page', (_label, payload) => {
    expect(LlmCallRowSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(LlmCallRowSchema.safeParse({ ...row, status: 'exploded' }).success).toBe(false);
  });
});
