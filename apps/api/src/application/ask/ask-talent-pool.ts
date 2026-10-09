import { QUESTION_MAX_CHARS } from '../../domain/ask/ask-limits';
import type { CandidateAlias, CandidateId } from '../../domain/candidates/candidate';
import { estimateTokens } from '../../domain/chunking/token-estimate';
import { type EvidenceChunk, verifyAnswerCitations } from '../../domain/citations/verify-citation';
import { scanQuestion } from '../../domain/guard/scan-question';
import type { Job, JobSlug } from '../../domain/jobs/job';
import type { RoutingReason } from '../../domain/routing/policy';
import type { Citation } from '../../domain/scoring/scorecard';
import { toUntrustedText, type UntrustedText } from '../../domain/shared/untrusted-text';
import { InjectionRejectedError } from '../errors/injection-rejected-error';
import { ValidationError } from '../errors/validation-error';
import type { GetJob } from '../jobs/get-job';
import { generateStructured } from '../llm/generate-structured';
import type { ChunkRepository, KeywordMatch, ScoredChunk } from '../ports/chunk-repository';
import type { Embedder } from '../ports/embedder';
import type { LlmClient } from '../ports/llm-client';
import type { Logger } from '../ports/logger';
import {
  ASK_PROMPT_VERSION,
  ASK_SYSTEM_PROMPT,
  AskAnswerSchema,
  buildAskTurn,
  normalizeAnswer,
} from '../prompts/ask-answer';

/** Ask tunables, from `config/ai.ts`. */
export interface AskSettings {
  /** `ASK_TOP_K`: chunks retrieved and shown to the model. */
  topK: number;
  /** `RETRIEVAL_POOL_PER_ARM`. */
  poolPerArm: number;
  /** `RRF_K`. */
  rrfK: number;
  /** `ASK_KEYWORD_MATCH`. */
  keywordMatch: KeywordMatch;
  /** `SIMILARITY_FLOOR`: below this best cosine similarity, no model is called. */
  similarityFloor: number;
  /** `ASK_MAX_OUTPUT_TOKENS`. */
  maxOutputTokens: number;
}

/** One question to the pool. */
export interface AskInput {
  slug: JobSlug;
  /** As the recruiter typed it. Validated and guarded before anything else happens. */
  question: string;
  /** The HTTP request behind the question, for `llm_calls`; absent for CLI runs. */
  requestId?: string;
}

/** What a question retrieved, before any answer. */
export interface QuestionRetrieval {
  job: Job;
  /** The question after the guard: invisible characters stripped, NFKC-normalized, trimmed. */
  question: UntrustedText;
  /** The top chunks across the job, by fused rank. Quarantined candidates are never among them. */
  hits: ScoredChunk[];
  /** The highest cosine similarity among `hits`, or `null` when nothing was found. */
  bestSimilarity: number | null;
}

/** Retrieves the chunks for one question. */
export type RetrieveForQuestion = (input: AskInput) => Promise<QuestionRetrieval>;

/** A verified citation, mapped to its candidate. */
export interface AskCitation extends Citation {
  candidateId: CandidateId;
  alias: CandidateAlias;
}

/**
 * How an ask ended:
 *
 * - `answered`: the model answered and at least one citation verified
 * - `below-floor`: nothing close enough was retrieved, so no model was called
 * - `model-insufficient`: the model said the chunks don't answer the question
 * - `unverified`: the model answered, but none of its citations verified, so the answer is withheld
 */
export type AskOutcomeKind = 'answered' | 'below-floor' | 'model-insufficient' | 'unverified';

/** The answer to one question. */
export interface AskOutcome {
  outcome: AskOutcomeKind;
  /** The model's answer, or a fixed explanation when there is no verified answer. */
  answer: string;
  /** True for every outcome except `answered`. */
  insufficientEvidence: boolean;
  /** Verified citations in the model's order; empty unless `answered`. */
  citations: AskCitation[];
  /** The model that answered, or `null` when none was called. */
  model: string | null;
  /** The routing rule that picked the tier, or `null` when no model was called. */
  routedReason: RoutingReason | null;
  /** Citations the model wrote that failed verification. */
  invalidCitations: number;
  retrieval: QuestionRetrieval;
}

/** Answers one question across a job's pool. */
export type AskTalentPool = (input: AskInput) => Promise<AskOutcome>;

/** Dependencies of {@link createRetrieveForQuestion}. */
export interface RetrieveForQuestionDeps {
  getJob: GetJob;
  embedder: Embedder;
  chunks: ChunkRepository;
  settings: Pick<AskSettings, 'topK' | 'poolPerArm' | 'rrfK' | 'keywordMatch'>;
}

/**
 * Steps 1–2 of ask (SPEC §9.7): validate and guard the question, then embed it and run hybrid
 * search across the job. The golden-question report uses it on its own to measure retrieval.
 *
 * @throws ValidationError if the question is empty or longer than `QUESTION_MAX_CHARS`.
 * @throws InjectionRejectedError if the guard finds a high-severity signal; nothing is embedded.
 * @throws NotFoundError if no job has the slug.
 *
 * @example
 * const { hits, bestSimilarity } = await createRetrieveForQuestion(deps)({ slug, question });
 */
export function createRetrieveForQuestion(deps: RetrieveForQuestionDeps): RetrieveForQuestion {
  return async ({ slug, question: raw }) => {
    const question = guardQuestion(raw);
    const job = await deps.getJob(slug);
    const queryVector = await deps.embedder.embedQuery(question);
    const hits = await deps.chunks.hybridSearch({
      jobId: job.id,
      candidateId: null,
      queryVector,
      queryText: question,
      keywordMatch: deps.settings.keywordMatch,
      poolPerArm: deps.settings.poolPerArm,
      rrfK: deps.settings.rrfK,
      limit: deps.settings.topK,
    });
    const bestSimilarity = hits.length === 0 ? null : Math.max(...hits.map((h) => h.similarity));
    return { job, question, hits, bestSimilarity };
  };
}

/** Dependencies of {@link createAskTalentPool}. */
export interface AskTalentPoolDeps extends RetrieveForQuestionDeps {
  llm: LlmClient;
  logger: Logger;
  settings: AskSettings;
}

/** Shown when nothing in the pool is close enough to the question to answer it. */
export const BELOW_FLOOR_ANSWER =
  "Nothing in this pool's resumes is close enough to the question to answer it.";

/** Shown when the model answered but no quote it cited could be found in the resumes. */
export const UNVERIFIED_ANSWER =
  "The model's answer couldn't be backed by a quote found in the resumes, so it isn't shown.";

/**
 * Ask the talent pool (SPEC §9.7, §6.3):
 *
 * 1. Validate and guard the question; a high-severity signal is refused (422) before anything is
 *    embedded.
 * 2. Embed it (`embedQuery`) and run hybrid search across the job, keeping the top `topK`.
 * 3. If the best cosine similarity is below the floor, answer "insufficient evidence" without a
 *    model call.
 * 4. Otherwise generate an `AskAnswer` (`ask.answer`). The routing context (the question, the
 *    context size and how many candidates it spans) lets the policy escalate to Flash.
 * 5. Verify every citation against the chunks shown. If none verifies, the answer is withheld and
 *    reported as insufficient evidence: nothing reaches the recruiter without a checked quote.
 *
 * Logs ids, counts, the best similarity and the route; never the question or the answer.
 *
 * @throws ValidationError, InjectionRejectedError or NotFoundError, as {@link createRetrieveForQuestion}.
 * @throws LlmOutputInvalidError if the reply never matches the schema.
 * @throws LlmUnavailableError, LlmCallError or FixtureMissingError from the model clients.
 *
 * @example
 * const ask = createAskTalentPool({ getJob, embedder, chunks, llm, logger, settings });
 * const { answer, citations } = await ask({ slug, question: 'Who has shipped RAG?' });
 */
export function createAskTalentPool(deps: AskTalentPoolDeps): AskTalentPool {
  const retrieve = createRetrieveForQuestion(deps);
  return async (input) => {
    const retrieval = await retrieve(input);
    const outcome =
      retrieval.bestSimilarity === null || retrieval.bestSimilarity < deps.settings.similarityFloor
        ? belowFloor(retrieval)
        : await answer(deps, retrieval, input.requestId);
    deps.logger.info('ask.answered', {
      jobId: retrieval.job.id,
      outcome: outcome.outcome,
      chunks: retrieval.hits.length,
      candidates: distinctAliases(retrieval.hits),
      bestSimilarity: retrieval.bestSimilarity,
      citations: outcome.citations.length,
      invalidCitations: outcome.invalidCitations,
      model: outcome.model,
      routedReason: outcome.routedReason,
    });
    return outcome;
  };
}

function guardQuestion(raw: string): UntrustedText {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new ValidationError('The question is empty.');
  }
  if (trimmed.length > QUESTION_MAX_CHARS) {
    throw new ValidationError(
      `The question is longer than ${String(QUESTION_MAX_CHARS)} characters.`,
    );
  }
  const scan = scanQuestion(trimmed);
  if (scan.rejected) {
    const labels = [
      ...new Set(scan.signals.filter((s) => s.severity === 'high').map((s) => s.label)),
    ];
    throw new InjectionRejectedError(
      `The question was refused because it contains hidden content (${labels.join('; ')}). Ask it again as plain text.`,
    );
  }
  return toUntrustedText(scan.text.trim());
}

function belowFloor(retrieval: QuestionRetrieval): AskOutcome {
  return {
    outcome: 'below-floor',
    answer: BELOW_FLOOR_ANSWER,
    insufficientEvidence: true,
    citations: [],
    model: null,
    routedReason: null,
    invalidCitations: 0,
    retrieval,
  };
}

async function answer(
  deps: AskTalentPoolDeps,
  retrieval: QuestionRetrieval,
  requestId: string | undefined,
): Promise<AskOutcome> {
  const turn = buildAskTurn(retrieval.question, retrieval.hits);
  const result = await generateStructured(deps.llm, {
    task: 'ask.answer',
    promptVersion: ASK_PROMPT_VERSION,
    system: ASK_SYSTEM_PROMPT,
    contents: [turn],
    maxOutputTokens: deps.settings.maxOutputTokens,
    schema: AskAnswerSchema,
    routingContext: {
      question: retrieval.question,
      contextTokens: estimateTokens(turn.text),
      candidateCount: distinctAliases(retrieval.hits),
    },
    ...(requestId !== undefined && { requestId }),
  });
  const last = result.responses.at(-1);
  if (last === undefined) {
    throw new Error('generateStructured returned no response');
  }
  const reply = normalizeAnswer(result.value);
  const call = { model: last.model, routedReason: last.routedReason, retrieval };
  if (reply.insufficientEvidence) {
    return { ...call, ...withheld('model-insufficient', reply.answer), invalidCitations: 0 };
  }
  const byRef = new Map(retrieval.hits.map((hit) => [hit.ref, hit] as const));
  const { citations, invalid } = verifyAnswerCitations(
    reply.citations,
    evidenceMap(retrieval.hits),
  );
  if (citations.length === 0) {
    return { ...call, ...withheld('unverified', UNVERIFIED_ANSWER), invalidCitations: invalid };
  }
  return {
    ...call,
    outcome: 'answered',
    answer: reply.answer,
    insufficientEvidence: false,
    citations: citations.flatMap((citation) => {
      const hit = byRef.get(citation.ref);
      return hit === undefined
        ? []
        : [{ ...citation, candidateId: hit.candidateId, alias: hit.alias }];
    }),
    invalidCitations: invalid,
  };
}

function withheld(
  outcome: 'model-insufficient' | 'unverified',
  text: string,
): Pick<AskOutcome, 'outcome' | 'answer' | 'insufficientEvidence' | 'citations'> {
  return { outcome, answer: text, insufficientEvidence: true, citations: [] };
}

function evidenceMap(hits: readonly ScoredChunk[]): Map<string, EvidenceChunk> {
  return new Map(
    hits.map((hit) => [
      hit.ref,
      {
        ref: hit.ref,
        alias: hit.alias,
        section: hit.section,
        content: hit.content,
        startOffset: hit.startOffset,
      },
    ]),
  );
}

function distinctAliases(hits: readonly ScoredChunk[]): number {
  return new Set(hits.map((hit) => hit.alias)).size;
}
