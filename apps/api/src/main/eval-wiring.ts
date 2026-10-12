import { fileURLToPath } from 'node:url';

import type { EvalResults } from '../../evals/gates';
import { type InjectionRun, summarizeInjection } from '../../evals/injection-suite';
import {
  leakedNameWords,
  nameWords,
  type PiiResumeRun,
  type PiiSnippetRun,
  summarizePii,
} from '../../evals/pii-suite';
import { RECALL_AT_K, summarizeRetrievalSuite } from '../../evals/retrieval-suite';
import { type ScorecardCase, summarizeScorecards } from '../../evals/scorecard-suite';
import { NotFoundError } from '../application/errors';
import { createClassifyInjection } from '../application/guard/classify-injection';
import type { ResumeSource } from '../application/ingest/resume-source';
import { type LlmCallTally, withCallTally } from '../application/llm/llm-call-tally';
import type { Clock } from '../application/ports/clock';
import type { Logger } from '../application/ports/logger';
import {
  ASK_KEYWORD_MATCH,
  CLASSIFIER_MAX_OUTPUT_TOKENS,
  CLASSIFIER_QUARANTINE_CONFIDENCE,
  SEED_MIN_CALL_INTERVAL_MS,
  SIMILARITY_FLOOR,
} from '../config/ai';
import type { EvidenceChunk } from '../domain/citations/verify-citation';
import { decideGuard, shouldRunClassifier } from '../domain/guard/policy';
import { prepareResume } from '../domain/ingestion/prepare-resume';
import type { Requirement } from '../domain/jobs/job';
import { redact } from '../domain/redaction/redact';
import { type InjectionItem, readInjectionSet } from '../infrastructure/dataset/injection-set';
import { type PiiItem, readPiiSet } from '../infrastructure/dataset/pii-set';
import { createThrottle } from '../infrastructure/llm/decorators/with-throttle';
import type { DbPool } from '../infrastructure/postgres/create-pool';
import { createPgCandidateRepository } from '../infrastructure/postgres/pg-candidate-repository';
import { createPgChunkRepository } from '../infrastructure/postgres/pg-chunk-repository';
import { createPgJobRepository } from '../infrastructure/postgres/pg-job-repository';
import { createPgLlmCallRepository } from '../infrastructure/postgres/pg-llm-call-repository';
import { createPgScorecardRepository } from '../infrastructure/postgres/pg-scorecard-repository';
import { createAskGolden, loadGoldenQuestions, toGoldenRun } from './ask-wiring';
import { createLlm, type LlmSettings } from './llm-wiring';
import { DATA_DIRECTORY, loadSeedDataset, SEED_JOB_SLUG } from './seed-wiring';

/** `docs/evals.md`, whose generated block `npm run eval -- --write` replaces (SPEC §14). */
export const EVALS_DOCUMENT = fileURLToPath(new URL('../../../../docs/evals.md', import.meta.url));

/** The root `README.md`, whose gates block `npm run eval -- --write` replaces (SPEC §13.3). */
export const README_DOCUMENT = fileURLToPath(new URL('../../../../README.md', import.meta.url));

/** Dependencies of {@link createEvalHarness}. */
export interface EvalHarnessDeps {
  /** An owner-role pool, like seeding: the harness reads the seeded job and logs model calls. */
  pool: DbPool;
  clock: Clock;
  logger: Logger;
  /** Real `setTimeout` in the CLI; only record mode waits. */
  sleep: (ms: number) => Promise<void>;
}

/** The seeded job's rubric and every candidate's stored scorecard, ready to re-check. */
export interface ScorecardCases {
  requirements: Requirement[];
  cases: ScorecardCase[];
}

/** The wired parts of the eval runner that need the database or a model. */
export interface EvalHarness {
  /** Runs each item through the guard twice: rules only, and rules + classifier as ingestion does. */
  injection(items: readonly InjectionItem[]): Promise<InjectionRun[]>;
  /** Loads every seeded resume's candidate, latest scorecard and cited chunks. */
  scorecards(resumes: readonly ResumeSource[]): Promise<ScorecardCases>;
  tally: () => LlmCallTally;
}

/**
 * Wires the eval runner's guard and scorecard parts: the L3 classifier on the full LLM stack
 * (logged to `llm_calls`, throttled unless replaying), built exactly as `createSeeder`
 * builds it so replay finds the recorded fixtures, and the Postgres repositories.
 *
 * @example
 * const harness = createEvalHarness(settings, { pool, clock, logger, sleep });
 * const runs = await harness.injection(await readInjectionSet(DATA_DIRECTORY));
 */
export function createEvalHarness(settings: LlmSettings, deps: EvalHarnessDeps): EvalHarness {
  const { calls, tally } = withCallTally(createPgLlmCallRepository(deps.pool));
  const throttle =
    settings.mode === 'replay'
      ? undefined
      : createThrottle({
          minIntervalMs: SEED_MIN_CALL_INTERVAL_MS,
          clock: deps.clock,
          sleep: deps.sleep,
        });
  const { llm } = createLlm(settings, {
    clock: deps.clock,
    logger: deps.logger,
    calls,
    ...(throttle !== undefined && { throttle }),
  });
  const classify = createClassifyInjection({ llm, maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS });
  const thresholds = { quarantineConfidence: CLASSIFIER_QUARANTINE_CONFIDENCE };
  const jobs = createPgJobRepository(deps.pool);
  const candidates = createPgCandidateRepository(deps.pool);
  const scorecards = createPgScorecardRepository(deps.pool);
  const chunks = createPgChunkRepository(deps.pool);

  return {
    async injection(items) {
      const runs: InjectionRun[] = [];
      // One after another: in record mode, each missing verdict is a throttled live call.
      for (const item of items) {
        // Ingestion's order (SPEC §9.5): rules on the redacted text, then the classifier unless a
        // high signal already quarantines.
        const { redaction, signals } = prepareResume(item.text);
        const classifier = shouldRunClassifier(signals) ? await classify(redaction.text) : null;
        runs.push({
          id: item.id,
          label: item.label,
          category: item.category,
          status: {
            rules: decideGuard({ signals, classifier: null }, thresholds).status,
            rulesAndClassifier: decideGuard({ signals, classifier }, thresholds).status,
          },
        });
      }
      return runs;
    },

    async scorecards(resumes) {
      const job = await jobs.findBySlug(SEED_JOB_SLUG);
      if (job === null) {
        throw new NotFoundError(`No job with slug ${SEED_JOB_SLUG}. Run npm run seed first.`);
      }
      const cases: ScorecardCase[] = [];
      for (const resume of resumes) {
        const candidate = await candidates.findBySourceHash(job.id, resume.sourceHash);
        if (candidate === null) {
          throw new NotFoundError(
            `${resume.alias} is not seeded from its current file. Run npm run seed -- --reset.`,
          );
        }
        const scorecard = await scorecards.latestFor(candidate.id);
        const refs = [
          ...new Set(
            (scorecard?.result.requirements ?? []).flatMap((assessment) =>
              assessment.citations.map((citation) => citation.ref),
            ),
          ),
        ];
        const cited = refs.length === 0 ? [] : await chunks.getByRefs(job.id, refs);
        cases.push({
          alias: candidate.alias,
          quarantined: candidate.guardStatus === 'quarantined',
          redactedResume: candidate.redactedResume,
          scorecard:
            scorecard === null
              ? null
              : {
                  score: scorecard.score,
                  mustHavesMet: scorecard.mustHavesMet,
                  result: scorecard.result,
                },
          evidence: new Map(
            cited.map((chunk): [string, EvidenceChunk] => [
              chunk.ref,
              {
                ref: chunk.ref,
                alias: chunk.alias,
                section: chunk.section,
                content: chunk.content,
                startOffset: chunk.startOffset,
              },
            ]),
          ),
        });
      }
      return { requirements: job.requirements, cases };
    },

    tally,
  };
}

/** The PII suite's inputs after redaction. */
export interface PiiRuns {
  snippets: PiiSnippetRun[];
  resumes: PiiResumeRun[];
}

/**
 * Redacts each labelled snippet and checks every labelled value, then prepares each seeded resume
 * as ingestion does and checks its header name. Pure and offline: no model, no database.
 *
 * @example
 * summarizePii(...Object.values(runPiiEval(snippets, resumes)));
 */
export function runPiiEval(
  snippets: readonly PiiItem[],
  resumes: readonly ResumeSource[],
): PiiRuns {
  return {
    snippets: snippets.map((item) => {
      const { text } = redact(item.text, { personName: item.personName });
      return {
        id: item.id,
        entities: item.entities.map((entity) => ({
          type: entity.type,
          leaked: text.includes(entity.value),
        })),
      };
    }),
    resumes: resumes.map((resume) => {
      const { headerName, redaction } = prepareResume(resume.text);
      return {
        alias: resume.alias,
        nameWords: nameWords(headerName).length,
        leakedNameWords: leakedNameWords(redaction.text, headerName),
      };
    }),
  };
}

/**
 * Reads the injection and PII eval sets from `data/evals/`.
 *
 * @example
 * const { injection, pii } = await loadEvalSets();
 */
export async function loadEvalSets(): Promise<{ injection: InjectionItem[]; pii: PiiItem[] }> {
  const [injection, pii] = await Promise.all([
    readInjectionSet(DATA_DIRECTORY),
    readPiiSet(DATA_DIRECTORY),
  ]);
  return { injection, pii };
}

/** Every suite's result, and a tally of the model calls that produced them. */
export interface EvalRun {
  results: EvalResults;
  calls: LlmCallTally;
}

/** The wired eval runner. */
export interface Evals {
  /** Runs the four suites against the seeded job and the eval sets. */
  run(): Promise<EvalRun>;
}

/**
 * Wires `npm run eval` (SPEC §14): the scorecard check, the golden questions (the same wiring as
 * `ask:golden`), the guard over the injection set and redaction over the PII set, scored by the
 * pure suites in `apps/api/evals/`. The CLI and the eval integration test both build it here.
 *
 * @example
 * const { results, calls } = await createEvals(settings, deps).run();
 * const gates = checkGates(results);
 */
export function createEvals(settings: LlmSettings, deps: EvalHarnessDeps): Evals {
  const harness = createEvalHarness(settings, deps);
  const golden = createAskGolden(settings, deps);
  return {
    async run() {
      const [{ injection, pii }, { resumes }, questions] = await Promise.all([
        loadEvalSets(),
        loadSeedDataset(),
        loadGoldenQuestions(),
      ]);
      // Scorecards first: it fails fast, with a hint, when the job isn't seeded.
      const scorecards = await harness.scorecards(resumes);
      const goldenRuns = await golden.run(questions, { retrievalOnly: false });
      const injectionRuns = await harness.injection(injection);
      const piiRuns = runPiiEval(pii, resumes);
      return {
        results: {
          retrieval: summarizeRetrievalSuite(goldenRuns.map(toGoldenRun), {
            k: RECALL_AT_K,
            keywordMatch: ASK_KEYWORD_MATCH,
            similarityFloor: SIMILARITY_FLOOR,
          }),
          injection: summarizeInjection(injectionRuns),
          pii: summarizePii(piiRuns.snippets, piiRuns.resumes),
          scorecards: summarizeScorecards(scorecards.requirements, scorecards.cases),
        },
        calls: addTallies(harness.tally(), golden.tally()),
      };
    },
  };
}

function addTallies(a: LlmCallTally, b: LlmCallTally): LlmCallTally {
  return {
    attempts: a.attempts + b.attempts,
    live: a.live + b.live,
    fallbacks: a.fallbacks + b.fallbacks,
    failed: a.failed + b.failed,
  };
}
