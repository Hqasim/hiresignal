import type { TextSpan } from '@hiresignal/contracts';

/** The search parameter that opens a candidate with a quote highlighted, for example `?cite=120-180`. */
export const CITE_PARAM = 'cite';

const CITE_PATTERN = /^(\d+)-(\d+)$/;

/**
 * Builds the link to a candidate with a span highlighted (used by Ask's citations).
 *
 * @example
 * citedCandidatePath('c0ffee…', { start: 120, end: 180 }); // '/candidates/c0ffee…?cite=120-180'
 */
export function citedCandidatePath(candidateId: string, span: TextSpan): string {
  return `/candidates/${candidateId}?${CITE_PARAM}=${String(span.start)}-${String(span.end)}`;
}

/**
 * Reads `?cite=` back into a span. A malformed or empty value is ignored rather than an error: it
 * comes from a URL anyone can edit. Spans past the end of the text are dropped later, when the
 * resume is segmented.
 *
 * @example
 * parseCiteParam('120-180'); // { start: 120, end: 180 }
 * parseCiteParam('180-120'); // null
 */
export function parseCiteParam(value: string | null): TextSpan | null {
  const match = value === null ? null : CITE_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  return start < end && Number.isSafeInteger(end) ? { start, end } : null;
}
