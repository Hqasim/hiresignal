import { createGetCandidateDetail } from '../../src/application/candidates/get-candidate-detail';
import { createListCandidates } from '../../src/application/candidates/list-candidates';
import { createShortlistCandidate } from '../../src/application/candidates/shortlist-candidate';
import { createGetJob } from '../../src/application/jobs/get-job';
import { createListJobs } from '../../src/application/jobs/list-jobs';
import type { LlmResponse } from '../../src/application/ports/llm-client';
import { createCheckDailyCap } from '../../src/application/quota/check-daily-cap';
import { createScreenCandidate } from '../../src/application/screening/screen-candidate';
import type { CandidateId } from '../../src/domain/candidates/candidate';
import { ChunkRefSchema } from '../../src/domain/candidates/chunk-ref';
import type { Scorecard } from '../../src/domain/scoring/scorecard';
import { createApp } from '../../src/interfaces/http/app';
import { FakeClock } from '../fakes/fake-clock';
import { FakeDatabaseProbe } from '../fakes/fake-database-probe';
import { FakeLlmClient } from '../fakes/fake-llm-client';
import { InMemoryLlmCallRepository } from '../fakes/in-memory-llm-call-repository';
import { RecordingLogger } from '../fakes/recording-logger';
import { aScreeningWorld } from './screening-world';

/** Options of {@link aTestApp}. */
export interface TestAppOptions {
  /** Scripted model turns for `POST /screen`. */
  script?: readonly LlmResponse[];
  /** `DAILY_LLM_CALL_CAP`; the default leaves room. */
  cap?: number;
}

/**
 * The Hono app wired with the real use cases over in-memory fakes and the screening world
 * (job `senior-fullstack-ai`; C04 and C01 clean, C06 quarantined), so route tests exercise
 * validation, use cases, mappers and the error handler together.
 */
export async function aTestApp(options: TestAppOptions = {}) {
  const world = await aScreeningWorld();
  const clock = new FakeClock(new Date('2026-10-09T15:00:00Z'));
  const logger = new RecordingLogger();
  const database = new FakeDatabaseProbe();
  const llm = new FakeLlmClient(options.script ?? []);
  const calls = new InMemoryLlmCallRepository();
  const getJob = createGetJob({ jobs: world.jobs });
  const getCandidateDetail = createGetCandidateDetail({
    candidates: world.candidates,
    jobs: world.jobs,
    scorecards: world.scorecards,
  });
  const app = createApp({
    logger,
    health: { llmMode: 'replay', gitSha: 'abc1234', database },
    jobs: {
      listJobs: createListJobs({ jobs: world.jobs }),
      getJob,
      listCandidates: createListCandidates({ getJob, candidates: world.candidates }),
    },
    candidates: {
      getCandidateDetail,
      shortlistCandidate: createShortlistCandidate({
        candidates: world.candidates,
        getDetail: getCandidateDetail,
        clock,
      }),
      screenCandidate: createScreenCandidate({
        llm,
        embedder: world.embedder,
        jobs: world.jobs,
        candidates: world.candidates,
        chunks: world.chunks,
        scorecards: world.scorecards,
        clock,
        settings: {
          maxAgentSteps: 8,
          agentMaxOutputTokens: 2048,
          synthesisMaxOutputTokens: 8192,
          retrieval: { searchTopK: 4, poolPerArm: 20, rrfK: 60, maxQueryChars: 200 },
        },
      }),
      checkDailyCap: createCheckDailyCap({ calls, clock, cap: options.cap ?? 100 }),
    },
  });
  return { app, world, llm, calls, clock, logger, database };
}

/**
 * Stores a scorecard for `candidateId` with one verified citation of C04's first chunk.
 *
 * @example
 * await storeScorecard(world.scorecards, world.c04, 75);
 */
export function storeScorecard(
  scorecards: { save(scorecard: Omit<Scorecard, 'id'>): Promise<Scorecard> },
  candidateId: CandidateId,
  score: number,
): Promise<Scorecard> {
  return scorecards.save({
    candidateId,
    score,
    mustHavesMet: 1,
    mustHavesTotal: 1,
    result: {
      requirements: [
        {
          requirementId: 'R1',
          rating: 'strong',
          rationale: 'Built React and TypeScript dashboards.',
          citations: [
            {
              ref: ChunkRefSchema.parse('C04#0'),
              section: 'experience',
              quote: 'Built React and TypeScript dashboards',
              span: { start: 40, end: 77 },
            },
          ],
          note: null,
        },
        {
          requirementId: 'R5',
          rating: 'unclear',
          rationale: 'Not assessed.',
          citations: [],
          note: 'citation_failed',
        },
      ],
      strengths: ['React at scale.'],
      concerns: [],
      summary: 'Strong frontend evidence.',
    },
    trace: [
      {
        step: 1,
        tool: 'read_section',
        args: { section: 'experience' },
        returnedRefs: [ChunkRefSchema.parse('C04#0')],
        latencyMs: 12,
        tokens: { input: 5000, output: 40, cached: 4096 },
      },
    ],
    promptVersion: 'screening@1',
    models: { agent: 'lite-model', synthesis: 'flash-model' },
    createdAt: new Date('2026-10-09T12:00:00Z'),
  });
}

const unused = () => Promise.reject(new Error('This test does not use resource routes'));

/** Job and candidate route dependencies for tests that only exercise health and errors. */
export const UNUSED_RESOURCE_ROUTES = {
  jobs: { listJobs: unused, getJob: unused, listCandidates: unused },
  candidates: {
    getCandidateDetail: unused,
    shortlistCandidate: unused,
    screenCandidate: unused,
    checkDailyCap: unused,
  },
};
