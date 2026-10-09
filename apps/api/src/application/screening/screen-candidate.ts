import type { CandidateId } from '../../domain/candidates/candidate';
import { finalizeAssessments } from '../../domain/citations/finalize-assessments';
import {
  describeCitationError,
  type DraftVerification,
  type EvidenceChunk,
  verifyDraft,
} from '../../domain/citations/verify-draft';
import type { Job } from '../../domain/jobs/job';
import { computeScore } from '../../domain/scoring/compute-score';
import type { Scorecard } from '../../domain/scoring/scorecard';
import { CandidateQuarantinedError } from '../errors/candidate-quarantined-error';
import { LlmOutputInvalidError } from '../errors/llm-output-invalid-error';
import { NotFoundError } from '../errors/not-found-error';
import {
  generateStructured,
  type StructuredRequest,
  type StructuredResult,
} from '../llm/generate-structured';
import type { CandidateRepository } from '../ports/candidate-repository';
import type { ChunkRepository, RetrievedChunk } from '../ports/chunk-repository';
import type { Clock } from '../ports/clock';
import type { Embedder } from '../ports/embedder';
import type { JobRepository } from '../ports/job-repository';
import type { LlmClient, LlmTurn } from '../ports/llm-client';
import type { ScorecardRepository } from '../ports/scorecard-repository';
import { buildScreeningTools } from '../prompts/screening-agent';
import { buildScreeningPrefix, SCREENING_PROMPT_VERSION } from '../prompts/screening-prefix';
import {
  buildRepairTurn,
  buildSynthesisTurn,
  type NormalizedDraft,
  normalizeDraft,
  type ScorecardDraft,
  ScorecardDraftSchema,
} from '../prompts/screening-synthesis';
import { runScreeningAgent } from './run-screening-agent';
import { type AgentRetrievalSettings, createScreeningTools } from './screening-tools';

/** Screening tunables, from `config/ai.ts`. */
export interface ScreeningSettings {
  /** `MAX_AGENT_STEPS`. */
  maxAgentSteps: number;
  /** `AGENT_MAX_OUTPUT_TOKENS`. */
  agentMaxOutputTokens: number;
  /** `SYNTHESIS_MAX_OUTPUT_TOKENS`. */
  synthesisMaxOutputTokens: number;
  retrieval: AgentRetrievalSettings;
}

/** Dependencies of {@link createScreenCandidate}. */
export interface ScreenCandidateDeps {
  llm: LlmClient;
  embedder: Embedder;
  jobs: JobRepository;
  candidates: CandidateRepository;
  chunks: ChunkRepository;
  scorecards: ScorecardRepository;
  clock: Clock;
  settings: ScreeningSettings;
}

/** One screening request. */
export interface ScreenCandidateInput {
  candidateId: CandidateId;
  /** The HTTP request behind a live re-screen, for `llm_calls`; absent when seeding. */
  requestId?: string;
}

/** The stored scorecard, plus metadata about how it was reached (for logs; never text). */
export interface ScreeningOutcome {
  scorecard: Scorecard;
  /** Whether verification failed and one `screen.repair` call was made. */
  repairAttempted: boolean;
  /** Requirements downgraded to `unclear` because errors remained after the repair. */
  downgraded: number;
  /** Agent turns taken. */
  agentSteps: number;
}

/** Screens one candidate. */
export type ScreenCandidate = (input: ScreenCandidateInput) => Promise<ScreeningOutcome>;

/**
 * The screening pipeline (SPEC §9.6, §6.3; ADRs 0011, 0012, 0020):
 *
 * 1. Load the candidate and its job. A quarantined candidate is refused before any model call.
 * 2. Stage 1: the evidence-gathering agent (`screen.agent`), scoped to this candidate.
 * 3. Stage 2: one `screen.synthesize` call in a fresh conversation with the same cacheable
 *    prefix, the evidence set and the `ScorecardDraft` schema.
 * 4. Verify every citation against the evidence. If anything fails, make one `screen.repair` call
 *    listing the exact errors; if the repair reply is unusable, keep the first draft.
 * 5. Downgrade whatever still fails (`unclear`, `citation_failed`), compute the score in code,
 *    and append the scorecard with its trace, prompt version and models.
 *
 * Only `RedactedText` chunks reach the prompts. The score never comes from the model.
 *
 * @throws NotFoundError if the candidate doesn't exist.
 * @throws CandidateQuarantinedError if the guard quarantined the resume.
 * @throws LlmOutputInvalidError if the synthesis reply never matches its schema.
 * @throws LlmUnavailableError, LlmCallError or FixtureMissingError from the model clients.
 *
 * @example
 * const screen = createScreenCandidate({ llm, embedder, jobs, candidates, chunks, scorecards, clock, settings });
 * const { scorecard } = await screen({ candidateId });
 */
export function createScreenCandidate(deps: ScreenCandidateDeps): ScreenCandidate {
  return async ({ candidateId, requestId }) => {
    const candidate = await deps.candidates.findById(candidateId);
    if (candidate === null) {
      throw new NotFoundError(`No candidate with id ${candidateId}.`);
    }
    if (candidate.guardStatus === 'quarantined') {
      throw new CandidateQuarantinedError(
        `Candidate ${candidate.alias} was quarantined by the injection guard, so it is never screened.`,
      );
    }
    const job = await loadJob(deps.jobs, candidate.jobId);
    const requirementIds = job.requirements.map((requirement) => requirement.id);
    const system = buildScreeningPrefix(job, {
      maxAgentSteps: deps.settings.maxAgentSteps,
      searchTopK: deps.settings.retrieval.searchTopK,
    });
    const tracing = requestId === undefined ? {} : { requestId };

    const outline = await deps.chunks.listOutline(candidate.id);
    const agent = await runScreeningAgent(
      {
        llm: deps.llm,
        clock: deps.clock,
        runTool: createScreeningTools(
          { embedder: deps.embedder, chunks: deps.chunks, retrieval: deps.settings.retrieval },
          {
            jobId: job.id,
            candidateId: candidate.id,
            requirementIds,
            sections: [...new Set(outline.map((entry) => entry.section))],
          },
        ),
        maxSteps: deps.settings.maxAgentSteps,
        maxOutputTokens: deps.settings.agentMaxOutputTokens,
      },
      {
        alias: candidate.alias,
        outline,
        system,
        tools: buildScreeningTools(requirementIds),
        ...tracing,
      },
    );

    const synthesisRequest = {
      promptVersion: SCREENING_PROMPT_VERSION,
      system,
      maxOutputTokens: deps.settings.synthesisMaxOutputTokens,
      schema: ScorecardDraftSchema,
      ...tracing,
    };
    const synthesisContents: LlmTurn[] = [
      buildSynthesisTurn(candidate.alias, agent.evidence, requirementIds),
    ];
    const synthesis = await generateStructured(deps.llm, {
      ...synthesisRequest,
      task: 'screen.synthesize',
      contents: synthesisContents,
    });
    const verify = (draft: NormalizedDraft): DraftVerification =>
      verifyDraft({
        draft: draft.assessments,
        requirements: job.requirements,
        evidence: evidenceMap(agent.evidence),
        alias: candidate.alias,
      });

    let draft = normalizeDraft(synthesis.value);
    let verification = verify(draft);
    let model = lastModel(synthesis);
    const repairAttempted = verification.errors.length > 0;
    if (repairAttempted) {
      const repair = await tryRepair(deps.llm, {
        ...synthesisRequest,
        task: 'screen.repair',
        contents: [
          ...synthesisContents,
          { role: 'model', content: lastResponse(synthesis).content },
          buildRepairTurn(verification.errors.map(describeCitationError)),
        ],
      });
      if (repair !== null) {
        draft = normalizeDraft(repair.value);
        verification = verify(draft);
        model = lastModel(repair);
      }
    }

    const requirements = finalizeAssessments(verification.assessments);
    const scorecard = await deps.scorecards.save({
      candidateId: candidate.id,
      ...computeScore(job.requirements, requirements),
      result: {
        requirements,
        strengths: draft.strengths,
        concerns: draft.concerns,
        summary: draft.summary,
      },
      trace: agent.trace,
      promptVersion: SCREENING_PROMPT_VERSION,
      models: { agent: agent.model, synthesis: model },
      createdAt: deps.clock.now(),
    });
    return {
      scorecard,
      repairAttempted,
      downgraded: requirements.filter((requirement) => requirement.note !== null).length,
      agentSteps: agent.steps,
    };
  };
}

async function loadJob(jobs: JobRepository, jobId: Job['id']): Promise<Job> {
  const job = await jobs.findById(jobId);
  if (job === null) {
    // The foreign key makes this impossible unless the database is corrupt.
    throw new Error(`Candidate references job ${jobId}, which does not exist`);
  }
  return job;
}

/**
 * The repair call. A reply that still doesn't match the schema isn't fatal: the first draft is
 * verified and downgraded instead, which is exactly what a failed repair would lead to anyway.
 */
async function tryRepair(
  llm: LlmClient,
  request: StructuredRequest<ScorecardDraft>,
): Promise<StructuredResult<ScorecardDraft> | null> {
  try {
    return await generateStructured(llm, request);
  } catch (error) {
    if (error instanceof LlmOutputInvalidError) {
      return null;
    }
    throw error;
  }
}

function evidenceMap(evidence: readonly RetrievedChunk[]): Map<string, EvidenceChunk> {
  return new Map(
    evidence.map((chunk) => [
      chunk.ref,
      {
        ref: chunk.ref,
        alias: chunk.alias,
        section: chunk.section,
        content: chunk.content,
        startOffset: chunk.startOffset,
      },
    ]),
  );
}

function lastResponse<T>(result: StructuredResult<T>) {
  const response = result.responses.at(-1);
  if (response === undefined) {
    throw new Error('generateStructured returned no response');
  }
  return response;
}

function lastModel<T>(result: StructuredResult<T>): string {
  return lastResponse(result).model;
}
