import type { CandidateAlias } from '../candidates/candidate';
import { type ChunkRef, parseChunkRef } from '../candidates/chunk-ref';
import type { Requirement, RequirementId } from '../jobs/job';
import {
  type Citation,
  CITATION_QUOTE_MAX_CHARS,
  CITATION_QUOTE_MIN_CHARS,
  type Rating,
} from '../scoring/scorecard';
import { assertNever } from '../shared/assert-never';
import { locateQuote, normalizeWhitespace } from './locate-quote';

/** A citation as the model wrote it: nothing about it is trusted yet. */
export interface DraftCitation {
  ref: string;
  quote: string;
}

/** One requirement's rating as the model wrote it. */
export interface DraftAssessment {
  requirementId: string;
  rating: Rating;
  rationale: string;
  citations: readonly DraftCitation[];
}

/** A chunk the agent actually retrieved for this candidate: the only text a citation may quote. */
export interface EvidenceChunk {
  ref: ChunkRef;
  alias: CandidateAlias;
  section: string;
  /** The chunk's content: an exact slice of the redacted resume (not its context header). */
  content: string;
  /** Where `content` starts in the redacted resume, so citation spans are resume offsets. */
  startOffset: number;
}

/** Why part of a draft failed verification (SPEC §9.6). */
export type CitationErrorKind =
  | 'unknown-ref'
  | 'foreign-ref'
  | 'quote-length'
  | 'quote-not-found'
  | 'missing-requirement'
  | 'duplicate-requirement'
  | 'unknown-requirement'
  | 'uncited-rating';

/** One verification failure, precise enough to tell the model exactly what to fix. */
export interface CitationError {
  kind: CitationErrorKind;
  /** As the draft wrote it, so it may be an id the job doesn't have. */
  requirementId: string;
  /** The offending citation's ref, for citation-level errors. */
  ref?: string;
}

/** One job requirement after verification: only citations that passed every check remain. */
export interface VerifiedAssessment {
  requirementId: RequirementId;
  /** The model's rating, unchanged; {@link finalizeAssessments} applies the downgrade. */
  rating: Rating;
  rationale: string;
  citations: Citation[];
  /** Everything wrong with this requirement's part of the draft. Empty means it passed. */
  errors: CitationError[];
}

/** The verified draft: one entry per job requirement, in rubric order, plus every error found. */
export interface DraftVerification {
  assessments: VerifiedAssessment[];
  /** All errors, including those not tied to a job requirement (`unknown-requirement`). */
  errors: CitationError[];
}

/** Inputs of {@link verifyDraft}. */
export interface VerifyDraftInput {
  draft: readonly DraftAssessment[];
  requirements: readonly Requirement[];
  /** The evidence set, keyed by ref. Chunks of other candidates are never in it. */
  evidence: ReadonlyMap<string, EvidenceChunk>;
  /** The candidate being screened; a ref with another alias is a `foreign-ref`. */
  alias: CandidateAlias;
}

/**
 * Checks a model's scorecard draft against the evidence it was given (SPEC §9.6, ADR 0012):
 *
 * - every job requirement appears exactly once, and no other requirement appears
 * - each citation's ref is in the evidence set and belongs to this candidate
 * - each whitespace-normalized quote is 8–300 characters and a substring of that chunk's content
 * - `strong` and `partial` ratings keep at least one valid citation
 *
 * Valid citations get their exact resume text and span. Invalid ones are reported and dropped.
 * Pure, so the same draft always verifies the same way.
 *
 * @example
 * const { assessments, errors } = verifyDraft({ draft, requirements, evidence, alias });
 * if (errors.length > 0) { // ask for one repair, then finalizeAssessments(...) }
 */
export function verifyDraft(input: VerifyDraftInput): DraftVerification {
  const jobIds = new Set(input.requirements.map((requirement) => requirement.id));
  const errors: CitationError[] = [];
  const byRequirement = new Map<string, DraftAssessment>();
  const duplicates = new Set<string>();
  for (const assessment of input.draft) {
    if (!jobIds.has(assessment.requirementId)) {
      errors.push({ kind: 'unknown-requirement', requirementId: assessment.requirementId });
    } else if (byRequirement.has(assessment.requirementId)) {
      duplicates.add(assessment.requirementId);
    } else {
      byRequirement.set(assessment.requirementId, assessment);
    }
  }

  const assessments = input.requirements.map((requirement) => {
    const drafted = byRequirement.get(requirement.id);
    const verified =
      drafted === undefined
        ? missing(requirement.id)
        : verifyAssessment(requirement.id, drafted, input);
    if (duplicates.has(requirement.id)) {
      verified.errors.unshift({ kind: 'duplicate-requirement', requirementId: requirement.id });
    }
    errors.push(...verified.errors);
    return verified;
  });
  return { assessments, errors };
}

function missing(requirementId: RequirementId): VerifiedAssessment {
  return {
    requirementId,
    rating: 'unclear',
    rationale: '',
    citations: [],
    errors: [{ kind: 'missing-requirement', requirementId }],
  };
}

function verifyAssessment(
  requirementId: RequirementId,
  drafted: DraftAssessment,
  input: VerifyDraftInput,
): VerifiedAssessment {
  const errors: CitationError[] = [];
  const citations: Citation[] = [];
  for (const draftCitation of drafted.citations) {
    const outcome = verifyCitation(draftCitation, input);
    if ('kind' in outcome) {
      errors.push({ kind: outcome.kind, requirementId, ref: draftCitation.ref });
    } else if (
      !citations.some((c) => c.ref === outcome.ref && c.span.start === outcome.span.start)
    ) {
      citations.push(outcome);
    }
  }
  if ((drafted.rating === 'strong' || drafted.rating === 'partial') && citations.length === 0) {
    errors.push({ kind: 'uncited-rating', requirementId });
  }
  return { requirementId, rating: drafted.rating, rationale: drafted.rationale, citations, errors };
}

function verifyCitation(
  draft: DraftCitation,
  input: VerifyDraftInput,
): Citation | { kind: CitationErrorKind } {
  const parsed = parseChunkRef(draft.ref);
  if (parsed !== null && parsed.alias !== input.alias) {
    return { kind: 'foreign-ref' };
  }
  const chunk = input.evidence.get(draft.ref);
  if (parsed === null || chunk === undefined) {
    return { kind: 'unknown-ref' };
  }
  const length = normalizeWhitespace(draft.quote).length;
  if (length < CITATION_QUOTE_MIN_CHARS || length > CITATION_QUOTE_MAX_CHARS) {
    return { kind: 'quote-length' };
  }
  const local = locateQuote(chunk.content, draft.quote);
  if (local === null) {
    return { kind: 'quote-not-found' };
  }
  const quote = chunk.content.slice(local.start, local.end);
  if (quote.length > CITATION_QUOTE_MAX_CHARS) {
    // Only possible when the resume's own whitespace pads a quote near the limit.
    return { kind: 'quote-length' };
  }
  return {
    ref: chunk.ref,
    section: chunk.section,
    quote,
    span: { start: chunk.startOffset + local.start, end: chunk.startOffset + local.end },
  };
}

/**
 * Explains one error in a sentence for the repair prompt. It names refs and requirement ids,
 * never resume text, so it is also safe to log.
 *
 * @example
 * describeCitationError({ kind: 'quote-not-found', requirementId: 'R3', ref: 'C04#2' });
 * // 'R3: the quote cited from C04#2 is not in that chunk. Copy the words exactly, or drop the citation.'
 */
export function describeCitationError(error: CitationError): string {
  const ref = error.ref ?? 'a citation';
  switch (error.kind) {
    case 'unknown-ref':
      return `${error.requirementId}: ${ref} is not one of the chunks in the evidence. Cite only refs shown in the evidence.`;
    case 'foreign-ref':
      return `${error.requirementId}: ${ref} belongs to another candidate. Cite only this candidate's chunks.`;
    case 'quote-length':
      return `${error.requirementId}: the quote cited from ${ref} must be ${String(CITATION_QUOTE_MIN_CHARS)}–${String(CITATION_QUOTE_MAX_CHARS)} characters long.`;
    case 'quote-not-found':
      return `${error.requirementId}: the quote cited from ${ref} is not in that chunk. Copy the words exactly, or drop the citation.`;
    case 'missing-requirement':
      return `${error.requirementId}: this requirement is missing. Assess every requirement exactly once.`;
    case 'duplicate-requirement':
      return `${error.requirementId}: this requirement appears more than once. Assess it exactly once.`;
    case 'unknown-requirement':
      return `${error.requirementId}: the job has no such requirement. Use only the job's requirement ids.`;
    case 'uncited-rating':
      return `${error.requirementId}: a strong or partial rating needs at least one valid citation. Add one, or rate it none or unclear.`;
    default:
      return assertNever(error.kind);
  }
}
