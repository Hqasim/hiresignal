import { z } from 'zod';

import { CandidateIdSchema } from '../../domain/candidates/candidate';
import {
  AgentTraceSchema,
  type Scorecard,
  ScorecardIdSchema,
  ScorecardModelsSchema,
  ScorecardResultSchema,
} from '../../domain/scoring/scorecard';

/** A `scorecards` row as node-postgres returns it, with every JSONB column validated. */
export const ScorecardRowSchema = z.object({
  id: ScorecardIdSchema,
  candidate_id: CandidateIdSchema,
  score: z.number().int().min(0).max(100),
  must_haves_met: z.number().int().nonnegative(),
  must_haves_total: z.number().int().nonnegative(),
  result: ScorecardResultSchema,
  trace: AgentTraceSchema,
  prompt_version: z.string(),
  models: ScorecardModelsSchema,
  created_at: z.date(),
});
/** See {@link ScorecardRowSchema}. */
export type ScorecardRow = z.infer<typeof ScorecardRowSchema>;

/** Every column of `scorecards`. */
export const SCORECARD_COLUMNS = `id, candidate_id, score, must_haves_met, must_haves_total,
  result, trace, prompt_version, models, created_at`;

/**
 * Maps a validated row to the domain entity.
 *
 * @example
 * const scorecard = toScorecard(ScorecardRowSchema.parse(row));
 */
export function toScorecard(row: ScorecardRow): Scorecard {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    score: row.score,
    mustHavesMet: row.must_haves_met,
    mustHavesTotal: row.must_haves_total,
    result: row.result,
    trace: row.trace,
    promptVersion: row.prompt_version,
    models: row.models,
    createdAt: row.created_at,
  };
}
