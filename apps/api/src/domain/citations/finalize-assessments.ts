import type { RequirementAssessment } from '../scoring/scorecard';
import type { VerifiedAssessment } from './verify-draft';

/** Shown for a requirement the model never assessed, so the scorecard still explains itself. */
export const NOT_ASSESSED_RATIONALE =
  'Not assessed: the screening model left this requirement out of its scorecard.';

/**
 * Applies the deterministic downgrade after the one repair attempt (SPEC §9.6, ADR 0012). It is
 * strict: a requirement with any remaining error becomes `unclear`, with note `citation_failed`,
 * and keeps only its valid citations. Requirements without errors pass through with note `null`.
 *
 * `unclear` is worth 0, so text the model could not back with a verified quote can never raise
 * a score, whatever an injected instruction asked for.
 *
 * @example
 * const requirements = finalizeAssessments(verifyDraft(input).assessments);
 */
export function finalizeAssessments(
  assessments: readonly VerifiedAssessment[],
): RequirementAssessment[] {
  return assessments.map(({ requirementId, rating, rationale, citations, errors }) => {
    if (errors.length === 0) {
      return { requirementId, rating, rationale, citations, note: null };
    }
    const missing = errors.some((error) => error.kind === 'missing-requirement');
    return {
      requirementId,
      rating: 'unclear',
      rationale: missing ? NOT_ASSESSED_RATIONALE : rationale,
      citations,
      note: 'citation_failed',
    };
  });
}
