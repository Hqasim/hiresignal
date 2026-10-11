import { readFile } from 'node:fs/promises';

import type { z } from 'zod';

/**
 * Reads a JSON Lines file (one JSON value per line, blank lines skipped) and validates every line
 * with `schema`, in file order. The eval sets in `data/evals/` use this format (SPEC §12).
 *
 * @throws Error naming the file, the line and the invalid fields, if a line isn't valid JSON or
 *   doesn't match the schema.
 *
 * @example
 * const questions = await readJsonl('data/evals/retrieval.jsonl', GoldenQuestionSchema);
 */
export async function readJsonl<T>(file: string, schema: z.ZodType<T>): Promise<T[]> {
  const lines = (await readFile(file, 'utf8')).split('\n').filter((line) => line.trim() !== '');
  return lines.map((line, index) => {
    const result = schema.safeParse(parseJson(line));
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path.join('.') || '(root)');
      throw new Error(`${file}:${String(index + 1)}: invalid ${fields.join(', ')}`);
    }
    return result.data;
  });
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}
