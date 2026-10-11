import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LlmCallRecord } from '../../src/application/ports/llm-call-repository';
import type { NewScorecard } from '../../src/application/ports/scorecard-repository';
import { type CandidateId, CandidateIdSchema } from '../../src/domain/candidates/candidate';
import { ChunkRefSchema } from '../../src/domain/candidates/chunk-ref';
import { JobSlugSchema } from '../../src/domain/jobs/job';
import { createPgCandidateRepository } from '../../src/infrastructure/postgres/pg-candidate-repository';
import { createPgJobRepository } from '../../src/infrastructure/postgres/pg-job-repository';
import { createPgLlmCallRepository } from '../../src/infrastructure/postgres/pg-llm-call-repository';
import { createPgScorecardRepository } from '../../src/infrastructure/postgres/pg-scorecard-repository';
import { aCandidate, aNewJob } from '../helpers/builders';
import { createTestDatabase, type TestDatabase } from '../helpers/test-database';

let db: TestDatabase;
let candidateId: CandidateId;

beforeAll(async () => {
  db = await createTestDatabase();
  const job = await createPgJobRepository(db.pool).upsert(
    aNewJob({ slug: JobSlugSchema.parse('scored-job') }),
  );
  ({ id: candidateId } = await createPgCandidateRepository(db.pool).insertIngested(
    aCandidate(job.id, 'C01', [{ section: 'experience', text: 'Shipped RAG', theta: 0 }]),
  ));
});
afterAll(async () => {
  await db.drop();
});

function aScorecard(score: number, createdAt: string): NewScorecard {
  return {
    candidateId,
    score,
    mustHavesMet: 1,
    mustHavesTotal: 1,
    result: {
      requirements: [
        {
          requirementId: 'R1',
          rating: 'strong',
          rationale: 'Shipped RAG in production.',
          citations: [
            {
              ref: ChunkRefSchema.parse('C01#0'),
              section: 'experience',
              quote: 'Shipped RAG',
              span: { start: 0, end: 11 },
            },
          ],
          note: null,
        },
      ],
      strengths: ['RAG'],
      concerns: [],
      summary: 'Strong.',
    },
    trace: [
      {
        step: 1,
        tool: 'search_resume',
        args: { query: 'rag', requirementId: 'R1' },
        returnedRefs: [ChunkRefSchema.parse('C01#0')],
        latencyMs: 120,
        tokens: { input: 5000, output: 40, cached: 4096 },
      },
    ],
    promptVersion: 'screening@1',
    models: { agent: 'lite-model', synthesis: 'flash-model' },
    createdAt: new Date(createdAt),
  };
}

describe('PgScorecardRepository', () => {
  it('round-trips the result, trace and models through their JSONB schemas', async () => {
    const draft = aScorecard(88, '2026-10-01T09:00:00.000Z');

    const saved = await createPgScorecardRepository(db.pool).save(draft);

    expect(saved).toEqual({ ...draft, id: expect.any(String) as string });
  });

  it('returns the newest scorecard, because re-screening appends', async () => {
    const scorecards = createPgScorecardRepository(db.pool);
    await scorecards.save(aScorecard(70, '2026-10-02T09:00:00.000Z'));
    await scorecards.save(aScorecard(55, '2026-10-03T09:00:00.000Z'));

    expect((await scorecards.latestFor(candidateId))?.score).toBe(55);
  });

  it('returns null for a candidate that was never screened', async () => {
    const unscreened = CandidateIdSchema.parse('00000000-0000-4000-8000-000000000000');

    expect(await createPgScorecardRepository(db.pool).latestFor(unscreened)).toBeNull();
  });
});

describe('PgLlmCallRepository', () => {
  const call: LlmCallRecord = {
    requestId: 'req-1',
    task: 'ask.answer',
    model: 'lite-model',
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
    createdAt: new Date('2026-10-08T12:00:00.000Z'),
  };

  it('counts only live calls at or after the cutoff, for the daily cap', async () => {
    const calls = createPgLlmCallRepository(db.pool);
    const midnight = new Date('2026-10-08T00:00:00.000Z');
    await calls.record(call);
    await calls.record({ ...call, createdAt: midnight, status: 'rate_limited' });
    await calls.record({ ...call, source: 'replay' });
    await calls.record({ ...call, createdAt: new Date('2026-10-07T23:59:59.999Z') });
    await calls.record({
      ...call,
      task: 'embed.query',
      tier: 'embedding',
      requestId: null,
      promptVersion: null,
      inputTokens: null,
      outputTokens: null,
    });

    expect(await calls.countLiveSince(midnight)).toBe(3);
  });

  it('stores every metadata field without content', async () => {
    const calls = createPgLlmCallRepository(db.pool);
    await calls.record({ ...call, requestId: 'req-fields', isFallback: true, cachedTokens: 512 });

    const { rows } = await db.pool.query(
      `select task, model, tier, routed_reason, is_fallback, source, status, input_tokens,
              output_tokens, cached_tokens, latency_ms, prompt_version
       from llm_calls where request_id = 'req-fields'`,
    );

    expect(rows).toEqual([
      {
        task: 'ask.answer',
        model: 'lite-model',
        tier: 'lite',
        routed_reason: 'default',
        is_fallback: true,
        source: 'live',
        status: 'ok',
        input_tokens: 900,
        output_tokens: 120,
        cached_tokens: 512,
        latency_ms: 640,
        prompt_version: 'ask@1',
      },
    ]);
  });

  describe('summary and recent, for the ops page', () => {
    const since = new Date('2026-10-20T00:00:00.000Z');
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 9, minute));
    const lite = { ...call, model: 'lite-model', tier: 'lite', routedReason: 'default' } as const;

    beforeAll(async () => {
      const calls = createPgLlmCallRepository(db.pool);
      const attempts: LlmCallRecord[] = [
        { ...lite, latencyMs: 100, inputTokens: 1000, outputTokens: 10, cachedTokens: 500 },
        { ...lite, latencyMs: 200, inputTokens: 1000, outputTokens: 10, cachedTokens: null },
        { ...lite, latencyMs: 300, status: 'rate_limited', inputTokens: null, outputTokens: null },
        {
          ...lite,
          latencyMs: 400,
          routedReason: 'comparative-intent',
          isFallback: true,
          inputTokens: 2000,
          outputTokens: 20,
          cachedTokens: 1000,
        },
        {
          ...call,
          model: 'flash-model',
          tier: 'flash',
          routedReason: 'comparative-intent',
          status: 'timeout',
          latencyMs: 900,
          inputTokens: null,
          outputTokens: null,
        },
        // A replay reads a fixture: counted, but its tokens and ~0 ms latency are left out.
        { ...lite, source: 'replay', latencyMs: 1, inputTokens: 5000, cachedTokens: 5000 },
        {
          ...call,
          task: 'embed.query',
          model: 'embed-model',
          tier: 'embedding',
          latencyMs: 50,
          inputTokens: null,
          outputTokens: null,
        },
      ];
      const rows = attempts.map((row, index) => ({
        ...row,
        requestId: 'req-ops',
        createdAt: at(index),
      }));
      for (const row of rows) {
        await calls.record(row);
      }
      // Just before the window: must not count.
      await calls.record({ ...lite, latencyMs: 9999, createdAt: new Date(since.getTime() - 1) });
    });

    it('aggregates the window, with tokens and latency over live calls only', async () => {
      const { totals } = await createPgLlmCallRepository(db.pool).summary(since);

      expect(totals).toMatchObject({
        calls: 7,
        live: 6,
        replay: 1,
        errors: 2,
        fallbacks: 1,
        inputTokens: 4000,
        outputTokens: 40,
        cachedTokens: 1500,
        cacheRatio: 0.375,
      });
      // Live latencies 50, 100, 200, 300, 400, 900: percentile_cont interpolates.
      expect(totals.p50LatencyMs).toBeCloseTo(250);
      expect(totals.p95LatencyMs).toBeCloseTo(775);
    });

    it('breaks the numbers down by model, ordered by tier', async () => {
      const { byModel } = await createPgLlmCallRepository(db.pool).summary(since);

      expect(byModel.map(({ model, calls, errors }) => [model, calls, errors])).toEqual([
        ['embed-model', 1, 0],
        ['flash-model', 1, 1],
        ['lite-model', 5, 1],
      ]);
      const [embedding, flash, liteStats] = byModel;
      expect(embedding).toMatchObject({ tier: 'embedding', cacheRatio: null, p50LatencyMs: 50 });
      expect(flash).toMatchObject({ tier: 'flash', inputTokens: 0, cacheRatio: null });
      expect(liteStats).toMatchObject({ live: 4, replay: 1, fallbacks: 1, cacheRatio: 0.375 });
      expect(liteStats?.p50LatencyMs).toBeCloseTo(250);
      expect(liteStats?.p95LatencyMs).toBeCloseTo(385);
    });

    it('counts generation attempts by tier and routing rule, most frequent first', async () => {
      const { routeMix } = await createPgLlmCallRepository(db.pool).summary(since);

      expect(routeMix).toEqual([
        { tier: 'lite', routedReason: 'default', calls: 4 },
        { tier: 'flash', routedReason: 'comparative-intent', calls: 1 },
        { tier: 'lite', routedReason: 'comparative-intent', calls: 1 },
      ]);
    });

    it('reports zeros and nulls for a window without calls', async () => {
      const summary = await createPgLlmCallRepository(db.pool).summary(new Date('2030-01-01'));

      expect(summary).toEqual({
        totals: {
          calls: 0,
          live: 0,
          replay: 0,
          errors: 0,
          fallbacks: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          cacheRatio: null,
          p50LatencyMs: null,
          p95LatencyMs: null,
        },
        byModel: [],
        routeMix: [],
      });
    });

    it('lists the most recent calls first, with ids, up to the limit', async () => {
      const recent = await createPgLlmCallRepository(db.pool).recent(3);

      expect(recent.map((row) => [row.model, row.latencyMs])).toEqual([
        ['embed-model', 50],
        ['lite-model', 1],
        ['flash-model', 900],
      ]);
      expect(recent[0]).toMatchObject({
        requestId: 'req-ops',
        task: 'embed.query',
        source: 'live',
      });
      expect(recent.every((row) => Number.isInteger(row.id) && row.id > 0)).toBe(true);
    });

    it('breaks ties between calls logged in the same millisecond by id, newest first', async () => {
      const calls = createPgLlmCallRepository(db.pool);
      const same = new Date('2026-10-21T00:00:00.000Z');
      await calls.record({ ...lite, latencyMs: 11, createdAt: same });
      await calls.record({ ...lite, latencyMs: 22, createdAt: same });

      const [first, second] = await calls.recent(2);

      expect([first?.latencyMs, second?.latencyMs]).toEqual([22, 11]);
      expect((first?.id ?? 0) > (second?.id ?? 0)).toBe(true);
    });
  });

  it.each([
    ['tier', 'pro'],
    ['status', 'exploded'],
    ['source', 'cache'],
  ])('lets the database reject an unknown %s', async (column, value) => {
    await expect(
      db.pool.query(
        `insert into llm_calls (task, model, tier, routed_reason, source, status, latency_ms)
         select 'ask.answer', 'm', t.tier, 'default', t.source, t.status, 1
         from (select 'lite' as tier, 'live' as source, 'ok' as status) d,
              lateral (select
                case when $1 = 'tier' then $2 else d.tier end as tier,
                case when $1 = 'source' then $2 else d.source end as source,
                case when $1 = 'status' then $2 else d.status end as status) t`,
        [column, value],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
