import { z } from 'zod';

import { TextSpanSchema } from './common';
import { RequirementSchema } from './jobs';

/** How well the evidence supports a requirement (SPEC §9.2 rubric). */
export const RatingSchema = z.enum(['strong', 'partial', 'none', 'unclear']);
export type Rating = z.infer<typeof RatingSchema>;

/** A verified quote: the exact resume text at `span`, from chunk `ref` in `section`. */
export const CitationSchema = z.object({
  ref: z.string().regex(/^C\d{2}#\d+$/),
  section: z.string().min(1),
  quote: z.string().min(1),
  span: TextSpanSchema,
});
export type Citation = z.infer<typeof CitationSchema>;

/** One requirement's rating, joined to its rubric line. */
export const RequirementResultSchema = z.object({
  requirementId: RequirementSchema.shape.id,
  text: RequirementSchema.shape.text,
  kind: RequirementSchema.shape.kind,
  weight: RequirementSchema.shape.weight,
  rating: RatingSchema,
  rationale: z.string(),
  citations: z.array(CitationSchema),
  /** `citation_failed`: verification downgraded the model's rating to `unclear`. */
  note: z.enum(['citation_failed']).nullable(),
});
export type RequirementResult = z.infer<typeof RequirementResultSchema>;

/** One tool call of the screening agent: refs only, never resume text. */
export const AgentTraceEntrySchema = z.object({
  step: z.int().positive(),
  tool: z.enum(['search_resume', 'read_section']),
  args: z.record(z.string(), z.string()),
  returnedRefs: z.array(z.string()),
  latencyMs: z.int().nonnegative(),
  tokens: z
    .object({
      input: z.int().nonnegative(),
      output: z.int().nonnegative(),
      cached: z.int().nonnegative(),
    })
    .nullable(),
});
export type AgentTraceEntry = z.infer<typeof AgentTraceEntrySchema>;

/** Met and total must-have requirements. */
export const MustHavesSchema = z.object({
  met: z.int().nonnegative(),
  total: z.int().nonnegative(),
});
export type MustHaves = z.infer<typeof MustHavesSchema>;

/**
 * A candidate's latest scorecard (SPEC §10). `score` is computed in code from the ratings, and
 * every citation was verified against the resume.
 */
export const ScorecardSchema = z.object({
  score: z.int().min(0).max(100),
  mustHaves: MustHavesSchema,
  requirements: z.array(RequirementResultSchema),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  summary: z.string(),
  promptVersion: z.string().min(1),
  models: z.object({ agent: z.string().min(1), synthesis: z.string().min(1) }),
  createdAt: z.iso.datetime(),
  trace: z.array(AgentTraceEntrySchema),
});
export type Scorecard = z.infer<typeof ScorecardSchema>;
