import type { $brand } from 'zod';

declare const redacted: unique symbol;

/**
 * Resume text with PII replaced by tokens such as `[EMAIL_1]` (SPEC §9.3). The embedder, the
 * guard classifier and every prompt builder accept resume text only as `RedactedText`, so
 * sending a raw resume to a model is a compile error. Never widen it to `string` at those
 * boundaries.
 *
 * `redact()` (`redact.ts`) is the only way to produce it from raw text (ADR 0014).
 */
export type RedactedText = string & { readonly [redacted]: true };

/**
 * Restores the brand on text read back from `candidates.redacted_resume` or
 * `resume_chunks.content`. Those columns are written only from `RedactedText`, so the text was
 * redacted before it was stored.
 *
 * Only storage adapters should call this. Calling it on raw resume text defeats the type.
 *
 * @example
 * const resume = rehydrateRedactedText(row.redacted_resume);
 */
export function rehydrateRedactedText(stored: string): RedactedText {
  // Trusts the storage invariant in the TSDoc above. The other brand sites are redact() and the
  // derived constructors below (ADR 0014).
  return stored as RedactedText;
}

/**
 * A candidate alias such as `C04`, matched by its brand so this module needn't import
 * `candidates/` (which imports this one). Aliases are generated labels, never PII.
 */
type CandidateAliasLabel = string & $brand<'CandidateAlias'>;

/** The separators {@link joinRedactedText} may insert: code literals, so they hold no PII. */
export type RedactedTextSeparator = ' · ' | '\n' | '\n\n';

/**
 * A chunk ref such as `C04#3`, matched by its brand for the same reason. Refs are generated
 * labels, never PII.
 */
type ChunkRefLabel = string & $brand<'ChunkRef'>;

/**
 * A substring of redacted text, which is still redacted. Chunk contents and headings are cut from
 * the redacted resume this way (ADR 0014, ADR 0019).
 *
 * @example
 * sliceRedactedText(resume, chunk.startOffset, chunk.endOffset);
 */
export function sliceRedactedText(text: RedactedText, start: number, end: number): RedactedText {
  // Derived, not produced: every character came from redact() output.
  return text.slice(start, end) as RedactedText;
}

/**
 * Joins redacted text, candidate aliases and a fixed separator. The result is still redacted,
 * because each part either came from `redact()` or is a generated label. Context headers such as
 * `C04 · Experience · Engineer, Acme` and the embedder's `header + content` input are built this
 * way (ADR 0014, ADR 0019).
 *
 * @example
 * joinRedactedText([alias, sectionTitle], ' · '); // 'C04 · Experience'
 */
export function joinRedactedText(
  parts: readonly (RedactedText | CandidateAliasLabel)[],
  separator: RedactedTextSeparator,
): RedactedText {
  // Derived, not produced: see the TSDoc above.
  return parts.join(separator) as RedactedText;
}

/**
 * Prefixes redacted text with a chunk ref in brackets, as prompts label chunks and outline lines:
 * `[C04#3] C04 · Experience · …`. The result is still redacted: the ref is a generated label
 * (ADR 0014).
 *
 * @example
 * labelWithRef(ref, chunk.contextHeader); // '[C04#3] C04 · Experience · Engineer, Acme'
 */
export function labelWithRef(ref: ChunkRefLabel, text: RedactedText): RedactedText {
  // Derived, not produced: see the TSDoc above.
  return `[${ref}] ${text}` as RedactedText;
}
