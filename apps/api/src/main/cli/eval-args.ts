import { parseArgs } from 'node:util';

import { z } from 'zod';

/** Flags of `npm run eval`. */
const EvalArgsSchema = z.object({
  /** `replay` (default) reads fixtures; `record` calls Gemini for whatever has no fixture yet. */
  mode: z.enum(['replay', 'record']),
  /** Replace the generated block of docs/evals.md with this run's results. */
  write: z.boolean(),
});

/** Parsed `npm run eval` flags. */
export type EvalArgs = z.infer<typeof EvalArgsSchema>;

/**
 * Parses the eval CLI's arguments: `--mode replay|record` and `--write`.
 *
 * @throws Error naming the bad flag or value.
 *
 * @example
 * parseEvalArgs(['--write']); // { mode: 'replay', write: true }
 */
export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      mode: { type: 'string', default: 'replay' },
      write: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const result = EvalArgsSchema.safeParse({ mode: values.mode, write: values.write });
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  --${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid eval arguments:\n${problems.join('\n')}`);
  }
  return result.data;
}
