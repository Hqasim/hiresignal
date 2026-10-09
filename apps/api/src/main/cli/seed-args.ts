import { parseArgs } from 'node:util';

import { z } from 'zod';

/** Flags of `npm run seed`. */
const SeedArgsSchema = z.object({
  /** `replay` (default) reads fixtures; `record` calls Gemini and saves them; `live` only calls. */
  mode: z.enum(['replay', 'record', 'live']),
  /** Delete the job's candidates first, so every resume is ingested again. */
  reset: z.boolean(),
});

/** Parsed `npm run seed` flags. */
export type SeedArgs = z.infer<typeof SeedArgsSchema>;

/**
 * Parses the seed CLI's arguments: `--mode replay|record|live` and `--reset`.
 *
 * @throws Error naming the bad flag or value.
 *
 * @example
 * parseSeedArgs(['--mode', 'record', '--reset']); // { mode: 'record', reset: true }
 */
export function parseSeedArgs(argv: readonly string[]): SeedArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      mode: { type: 'string', default: 'replay' },
      reset: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const result = SeedArgsSchema.safeParse(values);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  --${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid seed arguments:\n${problems.join('\n')}`);
  }
  return result.data;
}
