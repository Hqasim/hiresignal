import type { AskResponse, RoutedReason } from '@hiresignal/contracts';
import { CircleHelp, Quote } from 'lucide-react';
import { Link } from 'react-router';

import { citedCandidatePath } from '@/features/candidates/cite-param';

/** Why the router picked the model tier (SPEC §9.1), in words. */
const ROUTE_LABELS: Record<RoutedReason, string> = {
  default: 'default route',
  'comparative-intent': 'escalated: comparative question',
  'candidate-count': 'escalated: evidence from many candidates',
  'context-size': 'escalated: large context',
};

/**
 * An answer with its verified citations, each linking to the candidate with the quote highlighted.
 * Insufficient evidence is a first-class result, not an error. The model is shown subtly.
 */
export function AnswerCard({ response }: { response: AskResponse }) {
  return (
    <article aria-labelledby="answer-heading" className="space-y-4 rounded-lg border p-4">
      <h2 id="answer-heading" className="flex items-center gap-2 text-lg font-semibold">
        {response.insufficientEvidence ? (
          <>
            <CircleHelp aria-hidden className="size-5" />
            Not enough evidence
          </>
        ) : (
          'Answer'
        )}
      </h2>
      <p className="whitespace-pre-line">{response.answer}</p>

      {response.citations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Evidence</h3>
          <ul className="space-y-2">
            {response.citations.map((citation) => (
              <li key={`${citation.ref}-${String(citation.span.start)}`}>
                <Link
                  to={citedCandidatePath(citation.candidateId, citation.span)}
                  className="flex gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm outline-none hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Quote aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{citation.alias}</span>
                    <span className="text-muted-foreground"> · {citation.section}</span>
                    <span className="block">{citation.quote}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {response.model === null || response.routedReason === null
          ? 'No model was called: nothing in the pool was close enough to the question.'
          : `Answered by ${response.model} (${ROUTE_LABELS[response.routedReason]}). Every quote was found in the resume by code.`}
      </p>
    </article>
  );
}
