import type { GoldenRun } from '../../evals/golden-report';
import {
  type AskOutcome,
  createAskTalentPool,
  createRetrieveForQuestion,
  type QuestionRetrieval,
} from '../application/ask/ask-talent-pool';
import { createGetJob } from '../application/jobs/get-job';
import { type LlmCallTally, withCallTally } from '../application/llm/llm-call-tally';
import type { KeywordMatch } from '../application/ports/chunk-repository';
import type { Clock } from '../application/ports/clock';
import type { Logger } from '../application/ports/logger';
import { ASK_KEYWORD_MATCH, SEED_MIN_CALL_INTERVAL_MS } from '../config/ai';
import { type GoldenQuestion, readRetrievalSet } from '../infrastructure/dataset/retrieval-set';
import { createThrottle } from '../infrastructure/llm/decorators/with-throttle';
import type { DbPool } from '../infrastructure/postgres/create-pool';
import { createPgChunkRepository } from '../infrastructure/postgres/pg-chunk-repository';
import { createPgJobRepository } from '../infrastructure/postgres/pg-job-repository';
import { createPgLlmCallRepository } from '../infrastructure/postgres/pg-llm-call-repository';
import { ASK_SETTINGS } from './ask-settings';
import { createLlm, type LlmSettings } from './llm-wiring';
import { DATA_DIRECTORY, SEED_JOB_SLUG } from './seed-wiring';

/** Every keyword-match mode, in the order the report shows them. */
const KEYWORD_MATCHES: readonly KeywordMatch[] = ['all', 'any', 'off'];

/** Dependencies of {@link createAskGolden}. */
export interface AskGoldenDeps {
  pool: DbPool;
  clock: Clock;
  logger: Logger;
  /** Real `setTimeout` in the CLI; only record mode waits. */
  sleep: (ms: number) => Promise<void>;
}

/** One golden question's run. */
export interface GoldenQuestionRun {
  question: GoldenQuestion;
  /** Retrieval with each keyword-match mode; `ASK_KEYWORD_MATCH`'s is what ask itself uses. */
  retrievals: Record<KeywordMatch, QuestionRetrieval>;
  /** The full ask, or `null` for a retrieval-only run. */
  answer: AskOutcome | null;
}

/** The wired golden-question runner and a tally of the model calls it made. */
export interface AskGolden {
  run(
    questions: readonly GoldenQuestion[],
    options: { retrievalOnly: boolean },
  ): Promise<GoldenQuestionRun[]>;
  tally: () => LlmCallTally;
}

/**
 * Wires ask for the golden questions (`npm run ask:golden`): the full LLM stack (logged to
 * `llm_calls`, throttled unless replaying), the Postgres repositories and `ASK_SETTINGS`, the
 * same use case the route runs. The CLI and the ask integration test both build it here, so
 * replay sends byte-identical requests to the recorded ones.
 *
 * Each question is retrieved once per keyword-match mode for the ablation. Only the first
 * embedding of a question can be live: in record mode the others replay its new fixture.
 *
 * @example
 * const golden = createAskGolden(settings, { pool, clock, logger, sleep });
 * const runs = await golden.run(await loadGoldenQuestions(), { retrievalOnly: false });
 */
export function createAskGolden(settings: LlmSettings, deps: AskGoldenDeps): AskGolden {
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
  const getJob = createGetJob({ jobs: createPgJobRepository(deps.pool) });
  const chunks = createPgChunkRepository(deps.pool);
  const retrievers = KEYWORD_MATCHES.map(
    (keywordMatch) =>
      [
        keywordMatch,
        createRetrieveForQuestion({
          getJob,
          embedder,
          chunks,
          settings: { ...ASK_SETTINGS, keywordMatch },
        }),
      ] as const,
  );
  const ask = createAskTalentPool({
    getJob,
    embedder,
    chunks,
    llm,
    logger: deps.logger,
    settings: ASK_SETTINGS,
  });

  return {
    async run(questions, { retrievalOnly }) {
      const runs: GoldenQuestionRun[] = [];
      for (const question of questions) {
        const input = { slug: SEED_JOB_SLUG, question: question.question };
        // One after another, not in parallel: in record mode, parallel calls would all miss the
        // question's embedding fixture and each make a live call.
        const retrievals: Partial<Record<KeywordMatch, QuestionRetrieval>> = {};
        for (const [mode, retrieve] of retrievers) {
          retrievals[mode] = await retrieve(input);
        }
        runs.push({
          question,
          retrievals: complete(retrievals),
          answer: retrievalOnly ? null : await ask(input),
        });
      }
      return runs;
    },
    tally,
  };
}

function complete(
  retrievals: Partial<Record<KeywordMatch, QuestionRetrieval>>,
): Record<KeywordMatch, QuestionRetrieval> {
  const { all, any, off } = retrievals;
  if (all === undefined || any === undefined || off === undefined) {
    throw new Error('Every keyword-match mode must be retrieved');
  }
  return { all, any, off };
}

/**
 * Reads the golden questions from `data/evals/retrieval.jsonl`.
 *
 * @example
 * const questions = await loadGoldenQuestions();
 */
export function loadGoldenQuestions(): Promise<GoldenQuestion[]> {
  return readRetrievalSet(DATA_DIRECTORY);
}

/**
 * Reduces a run to the ids and numbers the golden report scores: aliases in chunk order per mode,
 * the best similarity and candidate count of ask's own mode, and how the ask ended.
 *
 * @example
 * formatGoldenReport(runs.map(toGoldenRun), { k: 5, keywordMatch: ASK_KEYWORD_MATCH, similarityFloor });
 */
export function toGoldenRun(run: GoldenQuestionRun): GoldenRun {
  const aliases = (retrieval: QuestionRetrieval) => retrieval.hits.map((hit) => hit.alias);
  const asked = run.retrievals[ASK_KEYWORD_MATCH];
  return {
    id: run.question.id,
    expected: run.question.expected,
    ranked: {
      all: aliases(run.retrievals.all),
      any: aliases(run.retrievals.any),
      off: aliases(run.retrievals.off),
    },
    bestSimilarity: asked.bestSimilarity,
    candidates: new Set(aliases(asked)).size,
    answer:
      run.answer === null
        ? null
        : {
            outcome: run.answer.outcome,
            routedReason: run.answer.routedReason,
            citations: run.answer.citations.length,
            invalidCitations: run.answer.invalidCitations,
          },
  };
}
