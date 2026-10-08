import { z } from 'zod';

import type { LlmTurn } from '../ports/llm-client';

/** Version of the smoke prompt; part of its fixture key (SPEC §9.2, §9.8). */
export const PROMPT_VERSION = 'smoke@1';

/** The smoke check's reply: a flat enum and a number, the two shapes later schemas rely on. */
export const SmokeVerdictSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number().min(0).max(1),
});
/** See {@link SmokeVerdictSchema}. */
export type SmokeVerdict = z.infer<typeof SmokeVerdictSchema>;

/** A synthetic recruiter-style query for the embedding check. Not resume text. */
export const SMOKE_QUERY = 'Which candidates have run Postgres in production?';

/**
 * The fixed prompt `npm run llm:smoke` sends to each tier. It contains no resume text and no
 * variable data, so every run produces the same fixture key.
 *
 * @example
 * const { system, contents } = buildSmokePrompt();
 */
export function buildSmokePrompt(): { system: string; contents: readonly LlmTurn[] } {
  return {
    system:
      'You check that a model integration works. Classify the sentiment of the sentence the ' +
      'user gives you, and reply only with JSON that matches the response schema.',
    contents: [{ role: 'user', text: 'The deployment finished on time and every check passed.' }],
  };
}
