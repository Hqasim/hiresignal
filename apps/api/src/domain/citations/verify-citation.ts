import type { CandidateAlias } from '../candidates/candidate';
import { type ChunkRef, parseChunkRef } from '../candidates/chunk-ref';
import {
  type Citation,
  CITATION_QUOTE_MAX_CHARS,
  CITATION_QUOTE_MIN_CHARS,
} from '../scoring/scorecard';
import { locateQuote, normalizeWhitespace } from './locate-quote';

/** A citation as the model wrote it: nothing about it is trusted yet. */
export interface DraftCitation {
  ref: string;
  quote: string;
}

/** A chunk the model was shown: the only text a citation may quote. */
export interface EvidenceChunk {
  ref: ChunkRef;
  alias: CandidateAlias;
  section: string;
  /** The chunk's content: an exact slice of the redacted resume (not its context header). */
  content: string;
  /** Where `content` starts in the redacted resume, so citation spans are resume offsets. */
  startOffset: number;
}

/** Why one citation failed (SPEC §9.6). */
export type CitationFailure = 'unknown-ref' | 'foreign-ref' | 'quote-length' | 'quote-not-found';

/**
 * Checks one citation against the evidence (SPEC §9.6, §9.7, ADR 0012):
 *
 * - the ref parses, and is in the evidence the model was shown
 * - with an `alias`, the ref belongs to that candidate (screening); with `null`, any candidate in
 *   the evidence will do (ask, which spans the pool)
 * - the whitespace-normalized quote is 8–300 characters and occurs in that chunk's content
 *
 * A valid citation gets the exact resume text and its span in the redacted resume.
 *
 * @example
 * verifyCitation({ ref: 'C04#2', quote: 'Built the design system' }, evidence, null);
 * // { ref: 'C04#2', section: 'experience', quote: 'Built the design system', span: { start: 512, end: 535 } }
 */
export function verifyCitation(
  draft: DraftCitation,
  evidence: ReadonlyMap<string, EvidenceChunk>,
  alias: CandidateAlias | null,
): Citation | { failure: CitationFailure } {
  const parsed = parseChunkRef(draft.ref);
  if (parsed !== null && alias !== null && parsed.alias !== alias) {
    return { failure: 'foreign-ref' };
  }
  const chunk = evidence.get(draft.ref);
  if (parsed === null || chunk === undefined) {
    return { failure: 'unknown-ref' };
  }
  const length = normalizeWhitespace(draft.quote).length;
  if (length < CITATION_QUOTE_MIN_CHARS || length > CITATION_QUOTE_MAX_CHARS) {
    return { failure: 'quote-length' };
  }
  const local = locateQuote(chunk.content, draft.quote);
  if (local === null) {
    return { failure: 'quote-not-found' };
  }
  const quote = chunk.content.slice(local.start, local.end);
  if (quote.length > CITATION_QUOTE_MAX_CHARS) {
    // Only possible when the resume's own whitespace pads a quote near the limit.
    return { failure: 'quote-length' };
  }
  return {
    ref: chunk.ref,
    section: chunk.section,
    quote,
    span: { start: chunk.startOffset + local.start, end: chunk.startOffset + local.end },
  };
}

/** The citations of an answer after verification, and how many were dropped. */
export interface AnswerCitations {
  /** Valid citations in the order the model gave them, without duplicates. */
  citations: Citation[];
  /** Citations that failed a check. Logged as a count; their text is never logged. */
  invalid: number;
}

/**
 * Verifies an ask answer's citations across the pool (SPEC §9.7): each is checked with
 * {@link verifyCitation} against every chunk the model was shown, invalid ones are dropped, and
 * repeats of the same span are kept once. Pure, so the same answer always verifies the same way.
 *
 * @example
 * const { citations, invalid } = verifyAnswerCitations(answer.citations, evidence);
 * if (citations.length === 0) { // insufficient evidence }
 */
export function verifyAnswerCitations(
  drafts: readonly DraftCitation[],
  evidence: ReadonlyMap<string, EvidenceChunk>,
): AnswerCitations {
  const citations: Citation[] = [];
  let invalid = 0;
  for (const draft of drafts) {
    const outcome = verifyCitation(draft, evidence, null);
    if ('failure' in outcome) {
      invalid += 1;
    } else if (
      !citations.some((c) => c.ref === outcome.ref && c.span.start === outcome.span.start)
    ) {
      citations.push(outcome);
    }
  }
  return { citations, invalid };
}
