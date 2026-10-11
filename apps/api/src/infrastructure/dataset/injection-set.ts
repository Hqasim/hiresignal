import { join } from 'node:path';

import { z } from 'zod';

import { readJsonl } from './jsonl';

/**
 * One item of `data/evals/injection.jsonl` (SPEC §12): resume-like text that either attacks an AI
 * screener (`malicious`) or is a benign hard negative that looks like one (`benign`).
 */
export const InjectionItemSchema = z.strictObject({
  /** `M01`… malicious, `B01`… benign. */
  id: z.string().regex(/^[MB]\d{2}$/),
  label: z.enum(['malicious', 'benign']),
  /** The attack family (for example `role-hijack`) or the kind of hard negative. */
  category: z.string().min(1),
  /** Raw text, as ingestion would receive it: invisible characters and markup included. */
  text: z.string().min(1),
});
/** See {@link InjectionItemSchema}. */
export type InjectionItem = z.infer<typeof InjectionItemSchema>;

/**
 * Reads the injection eval set from `<dataDirectory>/evals/injection.jsonl`, in file order.
 *
 * @throws Error naming the line if one isn't valid JSON or doesn't match the schema.
 *
 * @example
 * const items = await readInjectionSet('data');
 */
export function readInjectionSet(dataDirectory: string): Promise<InjectionItem[]> {
  return readJsonl(join(dataDirectory, 'evals', 'injection.jsonl'), InjectionItemSchema);
}
