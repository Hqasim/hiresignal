import { parseArgs } from 'node:util';

import { z } from 'zod';

/** Flags of `npm run ask:golden`. */
const AskGoldenArgsSchema = z.object({
  /** `replay` (default) reads fixtures; `record` calls Gemini for whatever has no fixture yet. */
  mode: z.enum(['replay', 'record']),
  /** Embed and search only: no answer call. Records just the question embeddings (stage A). */
  retrievalOnly: z.boolean(),
});

/** Parsed `npm run ask:golden` flags. */
export type AskGoldenArgs = z.infer<typeof AskGoldenArgsSchema>;

/**
 * Parses the golden-question CLI's arguments: `--mode replay|record` and `--retrieval-only`.
 *
 * @throws Error naming the bad flag or value.
 *
 * @example
 * parseAskGoldenArgs(['--mode', 'record', '--retrieval-only']); // { mode: 'record', retrievalOnly: true }
 */
export function parseAskGoldenArgs(argv: readonly string[]): AskGoldenArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      mode: { type: 'string', default: 'replay' },
      'retrieval-only': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const result = AskGoldenArgsSchema.safeParse({
    mode: values.mode,
    retrievalOnly: values['retrieval-only'],
  });
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  --${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid ask:golden arguments:\n${problems.join('\n')}`);
  }
  return result.data;
}
