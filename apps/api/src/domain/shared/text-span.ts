import { z } from 'zod';

/**
 * A half-open character range `[start, end)` in a candidate's redacted resume. Guard signals use
 * it to mark an injection, and citations use it so the UI can highlight the quoted text.
 */
export const TextSpanSchema = z
  .object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })
  .refine((span) => span.end >= span.start, { message: 'A span cannot end before it starts' });

/** See {@link TextSpanSchema}. */
export type TextSpan = z.infer<typeof TextSpanSchema>;
