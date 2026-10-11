import type { Citation, RequirementResult, TextSpan } from '@hiresignal/contracts';
import { TriangleAlert } from 'lucide-react';

import { CitationChip } from './citation-chip';
import { RatingChip } from './rating-chip';

/** Whether two spans are the same range. */
export function sameSpan(a: TextSpan | null, b: TextSpan): boolean {
  return a !== null && a.start === b.start && a.end === b.end;
}

/**
 * One requirement of the scorecard: the rubric line, its rating, the model's rationale and the
 * verified citations behind it. A rating that verification downgraded says so.
 */
export function RequirementRow({
  result,
  activeSpan,
  onCite,
}: {
  result: RequirementResult;
  activeSpan: TextSpan | null;
  onCite: (citation: Citation) => void;
}) {
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="max-w-prose text-sm">
          <span className="font-medium">{result.requirementId}</span> {result.text}
          <span className="block text-xs text-muted-foreground">
            {result.kind === 'must' ? 'Must-have' : 'Nice-to-have'} · weight {result.weight}
          </span>
        </h4>
        <RatingChip rating={result.rating} />
      </div>
      {result.rationale !== '' && (
        <p className="text-sm text-muted-foreground">{result.rationale}</p>
      )}
      {result.note === 'citation_failed' && (
        <p className="flex items-center gap-1.5 text-xs">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          Downgraded to unclear: a quote the model cited could not be found in the resume.
        </p>
      )}
      {result.citations.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Citations for ${result.requirementId}`}>
          {result.citations.map((citation) => (
            <li key={`${citation.ref}-${String(citation.span.start)}`} className="max-w-full">
              <CitationChip
                citation={citation}
                active={sameSpan(activeSpan, citation.span)}
                onSelect={onCite}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
