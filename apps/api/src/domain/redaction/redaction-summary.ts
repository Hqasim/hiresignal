import { z } from 'zod';

/** Kinds of PII the redactor detects (SPEC §9.3). */
export const PiiTypeSchema = z.enum([
  'PERSON',
  'EMAIL',
  'PHONE',
  'URL',
  'ADDRESS',
  'SCHOOL',
  'GRAD_YEAR',
]);
/** See {@link PiiTypeSchema}. */
export type PiiType = z.infer<typeof PiiTypeSchema>;

/**
 * How many entities of each type were redacted, at most one entry per type. Stored as
 * `candidates.redaction_summary` and shown to the recruiter; it never contains the values.
 */
export const RedactionSummarySchema = z
  .array(z.object({ type: PiiTypeSchema, count: z.number().int().positive() }))
  .refine((entries) => new Set(entries.map((entry) => entry.type)).size === entries.length, {
    message: 'Each PII type may appear only once',
  });
/** See {@link RedactionSummarySchema}. */
export type RedactionSummary = z.infer<typeof RedactionSummarySchema>;
