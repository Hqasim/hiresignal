import { join } from 'node:path';

import { z } from 'zod';

import { PiiTypeSchema } from '../../domain/redaction/redaction-summary';
import { readJsonl } from './jsonl';

/**
 * One snippet of `data/evals/pii.jsonl` (SPEC §12): resume-like text and the PII entities in it,
 * labelled by hand, so the redactor's output can be checked against them.
 */
export const PiiItemSchema = z.strictObject({
  id: z.string().regex(/^P\d{2}$/),
  text: z.string().min(1),
  /** The header name redaction is told about, as ingestion passes it; `null` for none. */
  personName: z.string().nullable(),
  entities: z.array(z.strictObject({ type: PiiTypeSchema, value: z.string().min(1) })).min(1),
});
/** See {@link PiiItemSchema}. */
export type PiiItem = z.infer<typeof PiiItemSchema>;

/**
 * Reads the PII eval set from `<dataDirectory>/evals/pii.jsonl`, in file order.
 *
 * @throws Error naming the line if one isn't valid JSON or doesn't match the schema.
 *
 * @example
 * const snippets = await readPiiSet('data');
 */
export function readPiiSet(dataDirectory: string): Promise<PiiItem[]> {
  return readJsonl(join(dataDirectory, 'evals', 'pii.jsonl'), PiiItemSchema);
}
