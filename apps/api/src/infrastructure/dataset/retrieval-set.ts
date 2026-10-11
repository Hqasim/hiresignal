import { join } from 'node:path';

import { z } from 'zod';

import { CandidateAliasSchema } from '../../domain/candidates/candidate';
import { ChunkRefSchema } from '../../domain/candidates/chunk-ref';
import { readJsonl } from './jsonl';

/**
 * One line of `data/evals/retrieval.jsonl` (SPEC §12): a recruiter question and the candidates
 * whose resumes answer it. An empty `expected` marks an out-of-scope question that no resume
 * answers, which must come back as insufficient evidence.
 */
export const GoldenQuestionSchema = z.strictObject({
  /** `Q01`–`Q20` answerable, `X01`… out of scope. */
  id: z.string().regex(/^[QX]\d{2}$/),
  question: z.string().min(1),
  /** Aliases a good retrieval surfaces in its top results. */
  expected: z.array(CandidateAliasSchema),
  /** The chunks that hold the evidence, where one obviously does. */
  refs: z.array(ChunkRefSchema),
});
/** See {@link GoldenQuestionSchema}. */
export type GoldenQuestion = z.infer<typeof GoldenQuestionSchema>;

/**
 * Reads the golden questions from `<dataDirectory>/evals/retrieval.jsonl`, one JSON object per
 * line, in file order.
 *
 * @throws Error naming the line if one isn't valid JSON or doesn't match the schema.
 *
 * @example
 * const questions = await readRetrievalSet('data');
 */
export function readRetrievalSet(dataDirectory: string): Promise<GoldenQuestion[]> {
  return readJsonl(join(dataDirectory, 'evals', 'retrieval.jsonl'), GoldenQuestionSchema);
}
