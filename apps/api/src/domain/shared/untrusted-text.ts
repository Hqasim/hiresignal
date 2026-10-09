import { z } from 'zod';

/**
 * Text from outside the trust boundary that isn't resume text: a recruiter's question or a search
 * query the screening agent wrote. It never carries resume PII, so it doesn't need redaction, but
 * prompt builders must still spotlight it (SPEC §9.2), because it may contain instructions aimed at
 * the model.
 *
 * The brand records where the text came from; it doesn't judge the content. Every string is valid,
 * and the guard rules and spotlighting deal with what it says.
 */
export const UntrustedTextSchema = z.string().brand<'UntrustedText'>();
/** See {@link UntrustedTextSchema}. */
export type UntrustedText = z.infer<typeof UntrustedTextSchema>;

/**
 * Marks a question or search query as untrusted input for prompt builders.
 *
 * @example
 * const question = toUntrustedText(body.question);
 */
export function toUntrustedText(text: string): UntrustedText {
  return UntrustedTextSchema.parse(text);
}
