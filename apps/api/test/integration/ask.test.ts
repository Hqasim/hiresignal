import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { summarizeGoldenRuns } from '../../evals/golden-report';
import { ASK_KEYWORD_MATCH, SIMILARITY_FLOOR } from '../../src/config/ai';
import type { Candidate } from '../../src/domain/candidates/candidate';
import { createPgCandidateRepository } from '../../src/infrastructure/postgres/pg-candidate-repository';
import {
  createAskGolden,
  type GoldenQuestionRun,
  loadGoldenQuestions,
  toGoldenRun,
} from '../../src/main/ask-wiring';
import { createSeeder, loadSeedDataset } from '../../src/main/seed-wiring';
import { FakeClock } from '../fakes/fake-clock';
import { RecordingLogger } from '../fakes/recording-logger';
import { modelsFromEnvExample } from '../helpers/env-example-models';
import { createTestDatabase, type TestDatabase } from '../helpers/test-database';

// SPEC §20 Phase 6: every golden question replays offline through the same wiring as
// `npm run ask:golden`, which recorded it. Ask answers are asserted by invariants (verified spans,
// the floor, the routes), never by their wording.

let db: TestDatabase;
let runs: GoldenQuestionRun[];
const logger = new RecordingLogger();
const byAlias = new Map<string, Candidate>();

beforeAll(async () => {
  db = await createTestDatabase();
  const { models, embeddingModel } = modelsFromEnvExample();
  const settings = { mode: 'replay', apiKey: undefined, models, embeddingModel } as const;
  const deps = {
    pool: db.pool,
    clock: new FakeClock(),
    logger,
    sleep: () => Promise.reject(new Error('replay must never wait')),
  };
  const { outcomes } = await createSeeder(settings, deps).seed({
    ...(await loadSeedDataset()),
    reset: false,
  });
  const candidates = createPgCandidateRepository(db.pool);
  for (const outcome of outcomes) {
    const candidate = await candidates.findById(outcome.candidateId);
    if (candidate !== null) {
      byAlias.set(candidate.alias, candidate);
    }
  }
  await db.pool.query('delete from llm_calls');
  runs = await createAskGolden(settings, deps).run(await loadGoldenQuestions(), {
    retrievalOnly: false,
  });
});

afterAll(async () => {
  await db.drop();
});

function answerOf(run: GoldenQuestionRun) {
  if (run.answer === null) {
    throw new Error(`${run.question.id} has no answer`);
  }
  return run.answer;
}

const answerable = () => runs.filter((run) => run.question.expected.length > 0);
const outOfScope = () => runs.filter((run) => run.question.expected.length === 0);

describe('ask over the seeded pool, replayed', () => {
  it('replays all 20 answerable questions and 3 out-of-scope ones without a missing fixture', () => {
    expect(answerable()).toHaveLength(20);
    expect(outOfScope()).toHaveLength(3);
  });

  it('answers every answerable question with at least one verified citation', () => {
    for (const run of answerable()) {
      expect({ id: run.question.id, outcome: answerOf(run).outcome }).toEqual({
        id: run.question.id,
        outcome: 'answered',
      });
      expect(answerOf(run).citations.length).toBeGreaterThan(0);
    }
  });

  it("returns citations whose span selects exactly the quote in the cited candidate's resume", () => {
    for (const run of answerable()) {
      for (const citation of answerOf(run).citations) {
        const candidate = byAlias.get(citation.alias);
        expect(candidate?.id).toBe(citation.candidateId);
        expect(candidate?.guardStatus).not.toBe('quarantined');
        expect(citation.ref.startsWith(`${citation.alias}#`)).toBe(true);
        expect(candidate?.redactedResume.slice(citation.span.start, citation.span.end)).toBe(
          citation.quote,
        );
      }
    }
  });

  it('never retrieves or cites a quarantined candidate', () => {
    for (const run of runs) {
      const aliases = Object.values(run.retrievals).flatMap((r) => r.hits.map((hit) => hit.alias));
      expect(aliases).not.toContain('C06');
      expect(aliases).not.toContain('C07');
    }
  });

  it('answers out-of-scope questions with insufficient evidence and no model call', async () => {
    for (const run of outOfScope()) {
      expect(answerOf(run)).toMatchObject({
        outcome: 'below-floor',
        insufficientEvidence: true,
        citations: [],
        model: null,
      });
    }
    const { rows } = await db.pool.query<{ n: number }>(
      `select count(*)::int as n from llm_calls where task = 'ask.answer'`,
    );
    expect(rows[0]?.n).toBe(20);
  });

  it('routes 15 questions to Flash-Lite and escalates comparisons and pool-wide context', () => {
    const routes = answerable().map((run) => answerOf(run).routedReason);

    expect(routes.filter((reason) => reason === 'default')).toHaveLength(15);
    expect(routes.filter((reason) => reason === 'comparative-intent')).toHaveLength(3);
    expect(routes.filter((reason) => reason === 'candidate-count')).toHaveLength(2);
  });

  it('keeps hybrid recall@5 at the measured 1.000, ahead of vector-only', () => {
    const summary = summarizeGoldenRuns(runs.map(toGoldenRun), {
      k: 5,
      keywordMatch: ASK_KEYWORD_MATCH,
      similarityFloor: SIMILARITY_FLOOR,
    });

    expect(summary.byMode.any.recall).toBeGreaterThanOrEqual(1);
    expect(summary.byMode.any.mrr).toBeGreaterThanOrEqual(0.95);
    expect(summary.byMode.off.recall).toBeLessThan(summary.byMode.any.recall);
    expect(summary.floor.answerableBelowFloor).toEqual([]);
    expect(summary.floor.outOfScopeAtOrAboveFloor).toEqual([]);
  });

  it('logs every ask as metadata only, never the question or the answer', () => {
    const asked = logger.entries.filter((entry) => entry.event === 'ask.answered');
    const logged = JSON.stringify(logger.entries);

    expect(asked).toHaveLength(runs.length);
    for (const run of runs) {
      expect(logged).not.toContain(run.question.question);
      expect(logged).not.toContain(answerOf(run).answer);
    }
  });
});
