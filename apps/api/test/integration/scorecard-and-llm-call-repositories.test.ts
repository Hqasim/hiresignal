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
