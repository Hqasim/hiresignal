import type { AskResponse } from '@hiresignal/contracts';

import type { AskOutcome } from '../../../application/ask/ask-talent-pool';

/**
 * Maps an ask outcome to its response (SPEC §10). Retrieval details (hits, similarities) and the
 * outcome kind stay server-side, for logs and the golden-question report.
 *
 * @example
 * const body: AskResponse = toAskResponse(await askTalentPool({ slug, question }));
 */
export function toAskResponse(outcome: AskOutcome): AskResponse {
  return {
    answer: outcome.answer,
    insufficientEvidence: outcome.insufficientEvidence,
    citations: outcome.citations.map((citation) => ({
      ref: citation.ref,
      candidateId: citation.candidateId,
      alias: citation.alias,
      section: citation.section,
      quote: citation.quote,
      span: { start: citation.span.start, end: citation.span.end },
    })),
    model: outcome.model,
    routedReason: outcome.routedReason,
  };
}
