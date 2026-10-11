import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkGates, type EvalResults } from '../../evals/gates';
import type { LlmCallTally } from '../../src/application/llm/llm-call-tally';
import { createEvals } from '../../src/main/eval-wiring';
import { createSeeder, loadSeedDataset } from '../../src/main/seed-wiring';
import { FakeClock } from '../fakes/fake-clock';
import { RecordingLogger } from '../fakes/recording-logger';
import { modelsFromEnvExample } from '../helpers/env-example-models';
import { createTestDatabase, type TestDatabase } from '../helpers/test-database';

// SPEC §20 Phase 9: `npm run eval` replays offline on a freshly seeded database, through the same
// wiring as the CLI (`createEvals`), and every gate in evals/thresholds.ts passes. The CI `evals`
// job runs the CLI itself; this test pins the coverage of each suite, so a dataset that silently
// shrinks can't pass the gates with less evidence.

let db: TestDatabase;
let results: EvalResults;
let calls: LlmCallTally;

beforeAll(async () => {
  db = await createTestDatabase();
  const { models, embeddingModel } = modelsFromEnvExample();
  const settings = { mode: 'replay', apiKey: undefined, models, embeddingModel } as const;
  const deps = {
    pool: db.pool,
    clock: new FakeClock(),
    logger: new RecordingLogger(),
    sleep: () => Promise.reject(new Error('replay must never wait')),
  };
  const seeder = createSeeder(settings, deps);
  const { outcomes } = await seeder.seed({ ...(await loadSeedDataset()), reset: false });
  await seeder.screen(outcomes);
  ({ results, calls } = await createEvals(settings, deps).run());
});

afterAll(async () => {
  await db.drop();
});

describe('npm run eval, replayed on a fresh seed', () => {
  it('passes every gate', () => {
    expect(checkGates(results).filter((gate) => !gate.passed)).toEqual([]);
  });

  it('makes no live model call', () => {
    expect(calls.live).toBe(0);
    expect(calls.failed).toBe(0);
  });

  it('scores all 20 answerable and 3 out-of-scope golden questions, and every answer', () => {
    expect(results.retrieval.byMode.any.questions).toBe(20);
    expect(results.retrieval.answers).toMatchObject({
      answerable: 20,
      answered: 20,
      outOfScope: 3,
      declined: 3,
    });
  });

  it('runs all 40 injection items through both arms', () => {
    expect(results.injection.items).toEqual({ malicious: 20, benign: 20 });
    // The rules alone (Phase 3): 18 malicious and 4 benign flagged, every benign one at medium.
    expect(results.injection.byArm.rules).toMatchObject({ truePositives: 18, falsePositives: 4 });
  });

  it('checks every labelled PII entity and the names of all ten resumes', () => {
    expect(results.pii.snippets).toBe(15);
    expect(results.pii.resumes).toBe(10);
    expect(results.pii.byType.map((row) => row.type)).toHaveLength(7);
  });

  it('re-checks all ten candidates, eight scorecards and their 73 citations', () => {
    expect(results.scorecards.candidates).toBe(10);
    expect(results.scorecards.schema.total).toBe(8);
    expect(results.scorecards.citations.total).toBe(73);
  });
});
