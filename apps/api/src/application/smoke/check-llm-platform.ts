import type { ModelTier } from '../../domain/routing/llm-task';
import { generateStructured } from '../llm/generate-structured';
import type { Embedder } from '../ports/embedder';
import type { LlmClient } from '../ports/llm-client';
import {
  buildSmokePrompt,
  PROMPT_VERSION,
  SMOKE_QUERY,
  SmokeVerdictSchema,
} from '../prompts/smoke';

/** Dependencies of {@link createCheckLlmPlatform}: one client pinned to each tier. */
export interface CheckLlmPlatformDeps {
  lite: LlmClient;
  flash: LlmClient;
  embedder: Embedder;
  /** `SMOKE_MAX_OUTPUT_TOKENS`. */
  maxOutputTokens: number;
}

/** What one tier's structured generation reported. Metadata only, never the model's output. */
export interface TierCheck {
  tier: ModelTier;
  model: string;
  /** 1 when the first reply matched the schema, 2 when it needed the repair turn. */
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
}

/** The smoke check's result: both tiers answered with schema-valid JSON and the embedder worked. */
export interface LlmPlatformReport {
  generations: readonly TierCheck[];
  embedding: { dimensions: number };
}

const TIERS: readonly ModelTier[] = ['lite', 'flash'];

/**
 * Checks the model platform end to end (`npm run llm:smoke`, SPEC §20 Phase 2): one structured
 * generation on each tier, validated with Zod, and one query embedding. Run live, it proves the
 * key and all three model IDs work before any feature depends on them; replayed, it proves the
 * recorded fixtures still match the code.
 *
 * @throws LlmOutputInvalidError if a tier's reply doesn't match the schema after one repair.
 * @throws LlmCallError or FixtureMissingError from the clients.
 *
 * @example
 * const report = await createCheckLlmPlatform({ lite, flash, embedder, maxOutputTokens })();
 */
export function createCheckLlmPlatform(
  deps: CheckLlmPlatformDeps,
): () => Promise<LlmPlatformReport> {
  return async () => {
    const generations: TierCheck[] = [];
    // Sequential, so a failure names exactly one tier and free-tier limits aren't hit in a burst.
    for (const tier of TIERS) {
      const { responses } = await generateStructured(tier === 'lite' ? deps.lite : deps.flash, {
        task: 'platform.smoke',
        promptVersion: PROMPT_VERSION,
        ...buildSmokePrompt(),
        maxOutputTokens: deps.maxOutputTokens,
        schema: SmokeVerdictSchema,
      });
      generations.push(summarize(tier, responses));
    }
    const vector = await deps.embedder.embedQuery(SMOKE_QUERY);
    return { generations, embedding: { dimensions: vector.length } };
  };
}

function summarize(
  tier: ModelTier,
  responses: Awaited<ReturnType<typeof generateStructured>>['responses'],
): TierCheck {
  const last = responses.at(-1);
  return {
    tier,
    model: last?.model ?? 'unknown',
    attempts: responses.length,
    inputTokens: sum(responses.map((response) => response.usage.inputTokens)),
    outputTokens: sum(responses.map((response) => response.usage.outputTokens)),
    cachedTokens: sum(responses.map((response) => response.usage.cachedTokens)),
    latencyMs: sum(responses.map((response) => response.latencyMs)),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
