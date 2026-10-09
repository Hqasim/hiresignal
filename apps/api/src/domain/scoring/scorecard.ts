import { z } from 'zod';

import type { CandidateId } from '../candidates/candidate';
import { ChunkRefSchema } from '../candidates/chunk-ref';
import { RequirementIdSchema } from '../jobs/job';
import { TextSpanSchema } from '../shared/text-span';

/** How well the evidence supports a requirement (SPEC §9.2 rubric). */
export const RatingSchema = z.enum(['strong', 'partial', 'none', 'unclear']);
/** See {@link RatingSchema}. */
export type Rating = z.infer<typeof RatingSchema>;

/** Shortest quote a citation may use: long enough to be specific evidence (SPEC §9.6). */
export const CITATION_QUOTE_MIN_CHARS = 8;
/** Longest quote a citation may use: evidence, not a copy of the resume (SPEC §9.6). */
export const CITATION_QUOTE_MAX_CHARS = 300;

/**
 * A verified quote: `quote` is the exact text of chunk `ref` at `span` in the redacted resume, and
 * `section` is that chunk's section, so the UI can label and highlight it.
 */
export const CitationSchema = z.object({
  ref: ChunkRefSchema,
  section: z.string().min(1),
  quote: z.string().min(CITATION_QUOTE_MIN_CHARS).max(CITATION_QUOTE_MAX_CHARS),
  span: TextSpanSchema,
});
/** See {@link CitationSchema}. */
export type Citation = z.infer<typeof CitationSchema>;

/** Longest rationale per requirement: one or two sentences a recruiter reads at a glance. */
export const RATIONALE_MAX_CHARS = 300;
/** Most citations per requirement: enough to show breadth, few enough to check by eye. */
export const MAX_CITATIONS_PER_REQUIREMENT = 3;
/** Most strengths, and most concerns, per scorecard. */
export const MAX_SCORECARD_POINTS = 3;
/** Longest scorecard summary. */
export const SUMMARY_MAX_CHARS = 400;

/** One requirement's rating and the evidence behind it. */
export const RequirementAssessmentSchema = z.object({
  requirementId: RequirementIdSchema,
  rating: RatingSchema,
  rationale: z.string().max(RATIONALE_MAX_CHARS),
  citations: z.array(CitationSchema).max(MAX_CITATIONS_PER_REQUIREMENT),
  /** `citation_failed` when verification downgraded the rating to `unclear` (SPEC §9.6). */
  note: z.enum(['citation_failed']).nullable(),
});
/** See {@link RequirementAssessmentSchema}. */
export type RequirementAssessment = z.infer<typeof RequirementAssessmentSchema>;

/** The verified scorecard body, stored as `scorecards.result`. The score itself is computed in code. */
export const ScorecardResultSchema = z.object({
  requirements: z.array(RequirementAssessmentSchema),
  strengths: z.array(z.string()).max(MAX_SCORECARD_POINTS),
  concerns: z.array(z.string()).max(MAX_SCORECARD_POINTS),
  summary: z.string().max(SUMMARY_MAX_CHARS),
});
/** See {@link ScorecardResultSchema}. */
export type ScorecardResult = z.infer<typeof ScorecardResultSchema>;

/**
 * One tool call the screening agent made. Calls made in parallel share a `step`. It records refs,
 * never resume text; token usage belongs to the model turn and sits on that turn's first call.
 */
export const AgentTraceEntrySchema = z.object({
  step: z.number().int().positive(),
  tool: z.enum(['search_resume', 'read_section']),
  args: z.record(z.string(), z.string()),
  returnedRefs: z.array(ChunkRefSchema),
  latencyMs: z.number().int().nonnegative(),
  tokens: z
    .object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
      cached: z.number().int().nonnegative(),
    })
    .nullable(),
});
/** See {@link AgentTraceEntrySchema}. */
export type AgentTraceEntry = z.infer<typeof AgentTraceEntrySchema>;

/** The agent's tool calls in order, stored as `scorecards.trace`. */
export const AgentTraceSchema = z.array(AgentTraceEntrySchema);

/** Which model ran each screening stage, stored as `scorecards.models`. */
export const ScorecardModelsSchema = z.object({
  agent: z.string().min(1),
  synthesis: z.string().min(1),
});
/** See {@link ScorecardModelsSchema}. */
export type ScorecardModels = z.infer<typeof ScorecardModelsSchema>;

/** Database id of a scorecard. */
export const ScorecardIdSchema = z.uuid().brand<'ScorecardId'>();
/** See {@link ScorecardIdSchema}. */
export type ScorecardId = z.infer<typeof ScorecardIdSchema>;

/** A persisted screening result for one candidate. Re-screening adds a new scorecard. */
export interface Scorecard {
  id: ScorecardId;
  candidateId: CandidateId;
  /** 0–100, computed in code from the ratings (SPEC §9.6). */
  score: number;
  mustHavesMet: number;
  mustHavesTotal: number;
  result: ScorecardResult;
  trace: AgentTraceEntry[];
  promptVersion: string;
  models: ScorecardModels;
  createdAt: Date;
}
