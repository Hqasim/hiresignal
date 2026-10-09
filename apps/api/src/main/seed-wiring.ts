import { fileURLToPath } from 'node:url';

import { createClassifyInjection } from '../application/guard/classify-injection';
import { createIngestResume } from '../application/ingest/ingest-resume';
import { createSeedJob, type SeedJob } from '../application/ingest/seed-job';
import { type LlmCallTally, withCallTally } from '../application/llm/llm-call-tally';
import type { Clock } from '../application/ports/clock';
import type { Logger } from '../application/ports/logger';
import { createScreenCandidate } from '../application/screening/screen-candidate';
import { createScreenPool, type ScreenPool } from '../application/screening/screen-pool';
import {
  CHUNK_MAX_TOKENS,
  CLASSIFIER_MAX_OUTPUT_TOKENS,
  CLASSIFIER_QUARANTINE_CONFIDENCE,
  SEED_MIN_CALL_INTERVAL_MS,
} from '../config/ai';
import { JobSlugSchema } from '../domain/jobs/job';
import { type Dataset, readDataset } from '../infrastructure/dataset/fs-dataset';
import { createThrottle } from '../infrastructure/llm/decorators/with-throttle';
import type { DbPool } from '../infrastructure/postgres/create-pool';
import { createPgCandidateRepository } from '../infrastructure/postgres/pg-candidate-repository';
import { createPgChunkRepository } from '../infrastructure/postgres/pg-chunk-repository';
import { createPgJobRepository } from '../infrastructure/postgres/pg-job-repository';
import { createPgLlmCallRepository } from '../infrastructure/postgres/pg-llm-call-repository';
import { createPgScorecardRepository } from '../infrastructure/postgres/pg-scorecard-repository';
import { createLlm, type LlmSettings } from './llm-wiring';
import { SCREENING_SETTINGS } from './screening-settings';

/** `data/` at the repository root (SPEC §12). Read by the seed CLI, never by the Lambda bundle. */
export const DATA_DIRECTORY = fileURLToPath(new URL('../../../../data/', import.meta.url));

/** The demo's one job (SPEC §12). */
export const SEED_JOB_SLUG = JobSlugSchema.parse('senior-fullstack-ai');

/** Shared dependencies of {@link createSeeder}. */
export interface SeederDeps {
  /** An owner-role pool: `--reset` deletes candidates. */
  pool: DbPool;
  clock: Clock;
  logger: Logger;
  /** Real `setTimeout` in the CLI; only record and live modes wait. */
  sleep: (ms: number) => Promise<void>;
}

/** The wired seed use cases and a tally of the model calls they made. */
export interface Seeder {
  /** Loads the job and ingests its resumes. */
  seed: SeedJob;
  /** Precomputes a scorecard for every ingested, non-quarantined candidate that has none. */
  screen: ScreenPool;
  tally: () => LlmCallTally;
}

/**
 * Wires ingestion and screening for seeding: the full LLM stack (calls logged to `llm_calls`, and throttled to
 * `SEED_MIN_CALL_INTERVAL_MS` unless replaying), the L3 classifier, the Postgres repositories and
 * the AI tunables. The seed CLI and the seed integration test both build it here, so replay sends
 * byte-identical requests to the ones recorded.
 *
 * @example
 * const { seed, screen, tally } = createSeeder(settings, { pool, clock, logger, sleep });
 * const { outcomes } = await seed({ ...(await loadSeedDataset()), reset: false });
 * await screen(outcomes);
 */
export function createSeeder(settings: LlmSettings, deps: SeederDeps): Seeder {
  const { calls, tally } = withCallTally(createPgLlmCallRepository(deps.pool));
  const throttle =
    settings.mode === 'replay'
      ? undefined
      : createThrottle({
          minIntervalMs: SEED_MIN_CALL_INTERVAL_MS,
          clock: deps.clock,
          sleep: deps.sleep,
        });
  const { llm, embedder } = createLlm(settings, {
    clock: deps.clock,
    logger: deps.logger,
    calls,
    ...(throttle !== undefined && { throttle }),
  });
  const candidates = createPgCandidateRepository(deps.pool);
  const jobs = createPgJobRepository(deps.pool);
  const scorecards = createPgScorecardRepository(deps.pool);
  const ingest = createIngestResume({
    classify: createClassifyInjection({ llm, maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS }),
    embedder,
    candidates,
    thresholds: { quarantineConfidence: CLASSIFIER_QUARANTINE_CONFIDENCE },
    chunkMaxTokens: CHUNK_MAX_TOKENS,
  });
  const seed = createSeedJob({ jobs, candidates, ingest, logger: deps.logger, clock: deps.clock });
  const screen = createScreenPool({
    screen: createScreenCandidate({
      llm,
      embedder,
      jobs,
      candidates,
      chunks: createPgChunkRepository(deps.pool),
      scorecards,
      clock: deps.clock,
      settings: SCREENING_SETTINGS,
    }),
    scorecards,
    logger: deps.logger,
    clock: deps.clock,
  });
  return { seed, screen, tally };
}

/**
 * Reads the demo job and its ten resumes from `data/`.
 *
 * @example
 * const { job, resumes } = await loadSeedDataset();
 */
export function loadSeedDataset(): Promise<Dataset> {
  return readDataset(DATA_DIRECTORY, SEED_JOB_SLUG);
}
