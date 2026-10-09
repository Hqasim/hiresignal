import type { Scorecard as ScorecardDto } from '@hiresignal/contracts';

import type { Job } from '../../../domain/jobs/job';
import type { Scorecard } from '../../../domain/scoring/scorecard';

/**
 * Maps a stored scorecard to its DTO, joining each rating to its rubric line, in rubric order.
 * A requirement the job has but the scorecard lacks can't occur (verification adds every one),
 * so rows follow the scorecard and look up their rubric line.
 *
 * @example
 * toScorecardDto(scorecard, job).requirements[0]; // { requirementId: 'R1', text: '…', rating: 'strong', … }
 */
export function toScorecardDto(scorecard: Scorecard, job: Job): ScorecardDto {
  const rubric = new Map(job.requirements.map((requirement) => [requirement.id, requirement]));
  return {
    score: scorecard.score,
    mustHaves: { met: scorecard.mustHavesMet, total: scorecard.mustHavesTotal },
    requirements: scorecard.result.requirements.flatMap((assessment) => {
      const requirement = rubric.get(assessment.requirementId);
      if (requirement === undefined) {
        // A rubric edited after screening: the stale row is hidden rather than shown unlabelled.
        return [];
      }
      return [
        {
          requirementId: assessment.requirementId,
          text: requirement.text,
          kind: requirement.kind,
          weight: requirement.weight,
          rating: assessment.rating,
          rationale: assessment.rationale,
          citations: assessment.citations.map(({ ref, section, quote, span }) => ({
            ref,
            section,
            quote,
            span: { start: span.start, end: span.end },
          })),
          note: assessment.note,
        },
      ];
    }),
    strengths: scorecard.result.strengths,
    concerns: scorecard.result.concerns,
    summary: scorecard.result.summary,
    promptVersion: scorecard.promptVersion,
    models: { agent: scorecard.models.agent, synthesis: scorecard.models.synthesis },
    createdAt: scorecard.createdAt.toISOString(),
    trace: scorecard.trace.map((entry) => ({ ...entry, returnedRefs: [...entry.returnedRefs] })),
  };
}
