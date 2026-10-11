import type { Requirement, RequirementId } from '../jobs/job';
import type { Rating } from './scorecard';

/** The part of an assessment scoring reads. */
export interface RatedRequirement {
  requirementId: RequirementId;
  rating: Rating;
}

/** How a candidate stands on the job's must-have requirements. */
export interface MustHaveSummary {
  /** Must-haves rated `strong` or `partial`. */
  met: number;
  /** Must-haves rated `strong`: the subset of `met` backed by specific evidence. */
  strong: number;
  total: number;
}

/**
 * Counts the must-haves a candidate meets, and how many of those are `strong` (SPEC §9.6).
 * `met` alone overstates a resume whose every claim is a bare skills-list mention: those are
 * `partial` at most, so C03 meets 4/4 with none strong. Requirements are the job's rubric; a
 * missing rating counts as `unclear`, and a rating for a requirement the job lacks is ignored.
 *
 * @example
 * summarizeMustHaves(job.requirements, [{ requirementId: 'R1', rating: 'partial' }]);
 * // { met: 1, strong: 0, total: 4 } for the SPEC §12 rubric
 */
export function summarizeMustHaves(
  requirements: readonly Requirement[],
  ratings: readonly RatedRequirement[],
): MustHaveSummary {
  const byId = new Map(ratings.map((r) => [r.requirementId, r.rating]));
  const summary: MustHaveSummary = { met: 0, strong: 0, total: 0 };
  for (const requirement of requirements) {
    if (requirement.kind !== 'must') {
      continue;
    }
    const rating = byId.get(requirement.id) ?? 'unclear';
    summary.total += 1;
    if (rating === 'strong' || rating === 'partial') {
      summary.met += 1;
    }
    if (rating === 'strong') {
      summary.strong += 1;
    }
  }
  return summary;
}
