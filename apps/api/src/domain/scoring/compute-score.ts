import type { Requirement } from '../jobs/job';
import type { Rating } from './scorecard';
import { type RatedRequirement, summarizeMustHaves } from './summarize-must-haves';

/**
 * What each rating contributes to the score (SPEC §9.6). `unclear` counts as nothing: a claim the
 * evidence can't settle, or one whose citations failed verification, must not raise a score.
 */
export const RATING_VALUES: Readonly<Record<Rating, number>> = {
  strong: 1,
  partial: 0.5,
  none: 0,
  unclear: 0,
};

/** The numbers stored on a scorecard. */
export interface ScoreSummary {
  /** 0–100. */
  score: number;
  /** Must-haves rated `strong` or `partial`. */
  mustHavesMet: number;
  mustHavesTotal: number;
}

/**
 * Computes the score in code from verified ratings, so the model never chooses the number
 * (SPEC §9.6, ADR 0012): `round(100 × Σ(weight × value) / Σ weight)`, rounding halves up.
 *
 * Requirements are the job's rubric. A requirement without an assessment counts as `unclear`, and
 * an assessment for a requirement the job doesn't have is ignored, so a reply can't add weight.
 *
 * @example
 * computeScore(job.requirements, [{ requirementId: 'R1', rating: 'strong' }]);
 * // { score: 23, mustHavesMet: 1, mustHavesTotal: 4 } for the SPEC §12 rubric
 */
export function computeScore(
  requirements: readonly Requirement[],
  assessments: readonly RatedRequirement[],
): ScoreSummary {
  const ratings = new Map(assessments.map((a) => [a.requirementId, a.rating]));
  let weighted = 0;
  let totalWeight = 0;
  for (const requirement of requirements) {
    const rating = ratings.get(requirement.id) ?? 'unclear';
    weighted += requirement.weight * RATING_VALUES[rating];
    totalWeight += requirement.weight;
  }
  // Ratings are halves and weights integers, so 100 × weighted is exact before the division.
  const score = totalWeight === 0 ? 0 : Math.round((100 * weighted) / totalWeight);
  const mustHaves = summarizeMustHaves(requirements, assessments);
  return { score, mustHavesMet: mustHaves.met, mustHavesTotal: mustHaves.total };
}
