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
  // One of two casts that produce RedactedText (the other is in redact()); see the TSDoc above.
  return stored as RedactedText;
}
