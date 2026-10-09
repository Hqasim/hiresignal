import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import type { Hono } from 'hono';

import { createAskTalentPool } from '../application/ask/ask-talent-pool';
import { createGetCandidateDetail } from '../application/candidates/get-candidate-detail';
import { createListCandidates } from '../application/candidates/list-candidates';
import { createShortlistCandidate } from '../application/candidates/shortlist-candidate';
import type { SeedJobResult } from '../application/ingest/seed-job';
import { createGetJob } from '../application/jobs/get-job';
import { createListJobs } from '../application/jobs/list-jobs';
import type { LlmCallTally } from '../application/llm/llm-call-tally';
import type { Embedder } from '../application/ports/embedder';
import type { LlmClient } from '../application/ports/llm-client';
import type { Logger } from '../application/ports/logger';
import { createCheckDailyCap } from '../application/quota/check-daily-cap';
import { createScreenCandidate } from '../application/screening/screen-candidate';
import type { PoolScreening } from '../application/screening/screen-pool';
import type { LlmPlatformReport } from '../application/smoke/check-llm-platform';
import { type Env, parseEnv, parseMigrationEnv, parseSeedEnv, parseSmokeEnv } from '../config/env';
import { systemClock } from '../infrastructure/clock/system-clock';
import { createJsonConsoleLogger } from '../infrastructure/logging/json-console-logger';
import { createPool, type DbPool } from '../infrastructure/postgres/create-pool';
import { migrate, type MigrationResult, readMigrations } from '../infrastructure/postgres/migrator';
import { createPgCandidateRepository } from '../infrastructure/postgres/pg-candidate-repository';
import { createPgChunkRepository } from '../infrastructure/postgres/pg-chunk-repository';
import { createPgDatabaseProbe } from '../infrastructure/postgres/pg-database-probe';
import { createPgJobRepository } from '../infrastructure/postgres/pg-job-repository';
import { createPgLlmCallRepository } from '../infrastructure/postgres/pg-llm-call-repository';
import { createPgScorecardRepository } from '../infrastructure/postgres/pg-scorecard-repository';
import { createApp } from '../interfaces/http/app';
import type { AppBindings } from '../interfaces/http/app-bindings';
import { ASK_SETTINGS } from './ask-settings';
import type { SeedArgs } from './cli/seed-args';
import { createLlm, createProviderClients, createSmokeCheck, type LlmSettings } from './llm-wiring';
import { SCREENING_SETTINGS } from './screening-settings';
import { createSeeder, loadSeedDataset } from './seed-wiring';

/** The wired application, shared by every entry point. */
export interface Container {
  env: Env;
  logger: Logger;
  app: Hono<AppBindings>;
  /** The process-wide connection pool. Entry points that exit (the local server) end it. */
  pool: DbPool;
  /** Routed, retried, logged generation client for use cases (SPEC §7.3). */
  llm: LlmClient;
  /** Logged embedder for ingestion and search (ADR 0007). */
  embedder: Embedder;
}

/**
 * Composition root: the only place that reads configuration and wires adapters to ports.
 * Entry points call it once at module load, so warm Lambda invocations reuse every client.
 *
 * @throws Error if the environment is invalid, so a bad deploy fails at cold start.
 */
export function createContainer(source: Readonly<Record<string, string | undefined>>): Container {
  const env = parseEnv(source);
  const logger = createJsonConsoleLogger({ clock: systemClock });
  // One pool per process. Connecting is lazy, so a cold start pays nothing until the first query.
  const pool = createPool({ connectionString: env.DATABASE_URL, logger });
  const calls = createPgLlmCallRepository(pool);
  const { llm, embedder } = createLlm(llmSettingsFrom(env), { clock: systemClock, logger, calls });
  const jobs = createPgJobRepository(pool);
  const candidates = createPgCandidateRepository(pool);
  const scorecards = createPgScorecardRepository(pool);
  const getJob = createGetJob({ jobs });
  const chunks = createPgChunkRepository(pool);
  const getCandidateDetail = createGetCandidateDetail({ candidates, jobs, scorecards });
  const checkDailyCap = createCheckDailyCap({
    calls,
    clock: systemClock,
    cap: env.DAILY_LLM_CALL_CAP,
  });
  const app = createApp({
    logger,
    health: {
      llmMode: env.LLM_MODE,
      gitSha: env.GIT_SHA,
      database: createPgDatabaseProbe(pool),
    },
    jobs: {
      listJobs: createListJobs({ jobs }),
      getJob,
      listCandidates: createListCandidates({ getJob, candidates }),
    },
    candidates: {
      getCandidateDetail,
      shortlistCandidate: createShortlistCandidate({
        candidates,
        getDetail: getCandidateDetail,
        clock: systemClock,
      }),
      screenCandidate: createScreenCandidate({
        llm,
        embedder,
        jobs,
        candidates,
        chunks,
        scorecards,
        clock: systemClock,
        settings: SCREENING_SETTINGS,
      }),
      checkDailyCap,
    },
    ask: {
      askTalentPool: createAskTalentPool({
        getJob,
        embedder,
        chunks,
        llm,
        logger,
        settings: ASK_SETTINGS,
      }),
      checkDailyCap,
    },
  });
  return { env, logger, app, pool, llm, embedder };
}

/** The LLM part of the environment, in the shape the wiring expects. */
function llmSettingsFrom(env: Env): LlmSettings {
  return {
    mode: env.LLM_MODE,
    apiKey: env.GEMINI_API_KEY,
    models: { lite: env.GEMINI_MODEL_LITE, flash: env.GEMINI_MODEL_FLASH },
    embeddingModel: env.GEMINI_EMBEDDING_MODEL,
  };
}

/** `db/migrations/` at the repository root. Used by the migrate CLI, never by the Lambda bundle. */
const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../../../../db/migrations/', import.meta.url));

/** The migration CLI's dependencies: run once, then close the pool so the process can exit. */
export interface MigrationRunner {
  logger: Logger;
  run(): Promise<MigrationResult>;
  close(): Promise<void>;
}

/**
 * Wires the migrator to the owner connection (`DATABASE_MIGRATION_URL`, ADR 0018).
 *
 * @throws Error if `DATABASE_MIGRATION_URL` is missing or isn't a Postgres URL.
 */
export function createMigrationRunner(
  source: Readonly<Record<string, string | undefined>>,
): MigrationRunner {
  const env = parseMigrationEnv(source);
  const logger = createJsonConsoleLogger({ clock: systemClock });
  const pool = createPool({ connectionString: env.DATABASE_MIGRATION_URL, logger });
  return {
    logger,
    run: async () => migrate(pool, await readMigrations(MIGRATIONS_DIRECTORY)),
    close: () => pool.end(),
  };
}

/** The seed CLI's dependencies (`npm run seed`). */
export interface SeedRunner {
  logger: Logger;
  /**
   * Loads `data/`, seeds the demo job and precomputes its scorecards; returns the ingestion
   * outcomes, the screenings and a tally of model calls.
   */
  run(): Promise<{ result: SeedJobResult; screenings: PoolScreening[]; calls: LlmCallTally }>;
  close(): Promise<void>;
}

/**
 * Wires `npm run seed` (SPEC §20 Phase 4) on the owner connection (`DATABASE_MIGRATION_URL`,
 * SPEC §16), with the LLM stack in the mode the `--mode` flag picks.
 *
 * @throws Error if the environment is invalid, for example a missing key outside replay mode.
 */
export function createSeedRunner(
  source: Readonly<Record<string, string | undefined>>,
  args: SeedArgs,
): SeedRunner {
  const env = parseSeedEnv(source, args.mode);
  const logger = createJsonConsoleLogger({ clock: systemClock });
  const pool = createPool({ connectionString: env.DATABASE_MIGRATION_URL, logger });
  const seeder = createSeeder(
    {
      mode: args.mode,
      apiKey: env.GEMINI_API_KEY,
      models: { lite: env.GEMINI_MODEL_LITE, flash: env.GEMINI_MODEL_FLASH },
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
    },
    { pool, clock: systemClock, logger, sleep: (ms) => sleep(ms) },
  );
  return {
    logger,
    run: async () => {
      const result = await seeder.seed({ ...(await loadSeedDataset()), reset: args.reset });
      const screenings = await seeder.screen(result.outcomes);
      return { result, screenings, calls: seeder.tally() };
    },
    close: () => pool.end(),
  };
}

/** The smoke CLI's dependencies (`npm run llm:smoke`). */
export interface LlmSmokeRunner {
  logger: Logger;
  run(): Promise<LlmPlatformReport>;
}

/**
 * Wires the smoke check in `record` mode: live Gemini calls whose responses are saved as
 * fixtures, so a test can replay them offline (SPEC §20 Phase 2). Needs no database.
 *
 * @throws Error if `GEMINI_API_KEY` or a model ID is missing.
 */
export function createLlmSmokeRunner(
  source: Readonly<Record<string, string | undefined>>,
): LlmSmokeRunner {
  const env = parseSmokeEnv(source);
  const logger = createJsonConsoleLogger({ clock: systemClock });
  const models = { lite: env.GEMINI_MODEL_LITE, flash: env.GEMINI_MODEL_FLASH };
  const provider = createProviderClients(
    {
      mode: 'record',
      apiKey: env.GEMINI_API_KEY,
      models,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
    },
    { clock: systemClock, logger },
  );
  return { logger, run: createSmokeCheck(provider, models) };
}
