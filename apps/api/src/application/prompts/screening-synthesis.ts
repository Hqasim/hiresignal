import { z } from 'zod';

import type { CandidateAlias } from '../../domain/candidates/candidate';
import type { DraftAssessment } from '../../domain/citations/verify-draft';
import type { RequirementId } from '../../domain/jobs/job';
import {
  MAX_CITATIONS_PER_REQUIREMENT,
  MAX_SCORECARD_POINTS,
  RatingSchema,
  RATIONALE_MAX_CHARS,
  SUMMARY_MAX_CHARS,
} from '../../domain/scoring/scorecard';
import { capText } from '../llm/cap-text';
import type { LlmTurn } from '../ports/llm-client';
import { formatChunks, type PromptChunk } from './format-chunks';

/**
 * The scorecard the synthesis model writes (SPEC §9.6). It is flat (objects, arrays, enums and
 * strings) and uses only keywords Gemini documents for structured output: `enum` and `maxItems`.
 * Text lengths aren't in the schema, because `maxLength` isn't documented; {@link normalizeDraft}
 * caps them instead. Nothing in it is trusted until `verifyDraft` checks it.
 */
export const ScorecardDraftSchema = z.object({
  requirements: z.array(
    z.object({
      requirementId: z.string(),
      rating: RatingSchema,
      rationale: z.string(),
      citations: z
        .array(z.object({ ref: z.string(), quote: z.string() }))
        .max(MAX_CITATIONS_PER_REQUIREMENT),
    }),
  ),
  strengths: z.array(z.string()).max(MAX_SCORECARD_POINTS),
  concerns: z.array(z.string()).max(MAX_SCORECARD_POINTS),
  summary: z.string(),
});
/** See {@link ScorecardDraftSchema}. */
export type ScorecardDraft = z.infer<typeof ScorecardDraftSchema>;

/** A draft with its free text trimmed and capped, ready for verification. */
export interface NormalizedDraft {
  assessments: DraftAssessment[];
  strengths: string[];
  concerns: string[];
  summary: string;
}

/**
 * Trims every free-text field and caps rationales and the summary at the scorecard limits, so a
 * verbose reply can't fail storage. Quotes are left exactly as written: verification judges them.
 *
 * @example
 * const { assessments, summary } = normalizeDraft(draft);
 */
export function normalizeDraft(draft: ScorecardDraft): NormalizedDraft {
  return {
    assessments: draft.requirements.map((requirement) => ({
      ...requirement,
      rationale: capText(requirement.rationale, RATIONALE_MAX_CHARS),
    })),
    strengths: draft.strengths.map((point) => point.trim()).filter((point) => point !== ''),
    concerns: draft.concerns.map((point) => point.trim()).filter((point) => point !== ''),
    summary: capText(draft.summary, SUMMARY_MAX_CHARS),
  };
}

/**
 * The synthesis turn (stage 2): the candidate's alias, every chunk the agent retrieved
 * (spotlighted, labelled with refs) and the requirement ids to assess. It follows the cacheable
 * prefix in a fresh conversation, not the agent's history (ADR 0020).
 *
 * @example
 * const turn = buildSynthesisTurn(alias, evidence, job.requirements.map((r) => r.id));
 */
export function buildSynthesisTurn(
  alias: CandidateAlias,
  evidence: readonly PromptChunk[],
  requirementIds: readonly RequirementId[],
): LlmTurn {
  return {
    role: 'user',
    text: [
      `Stage 2: write the scorecard for candidate ${alias}.`,
      '',
      `The evidence set: every chunk retrieved in stage 1 (${String(evidence.length)}).`,
      '',
      formatChunks(evidence),
      '',
      `Assess each of ${requirementIds.join(', ')} exactly once, citing only the refs above. Reply only with JSON that follows the response schema.`,
    ].join('\n'),
  };
}

/**
 * The repair turn (SPEC §9.6): the exact problems verification found, one per line. The messages
 * name requirement ids and refs, never resume text.
 *
 * @example
 * buildRepairTurn(errors.map(describeCitationError));
 */
export function buildRepairTurn(problems: readonly string[]): LlmTurn {
  return {
    role: 'user',
    text: [
      'Software checked your scorecard against the evidence set and found these problems:',
      '',
      ...problems.map((problem) => `- ${problem}`),
      '',
      'Reply with the complete corrected scorecard as JSON that follows the response schema. Use only the evidence set above.',
    ].join('\n'),
  };
}
