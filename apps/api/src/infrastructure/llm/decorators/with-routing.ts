import type { LlmClient, LlmRequest, LlmResult } from '../../../application/ports/llm-client';
import type { RoutedLlmClient } from '../../../application/ports/routed-llm-client';
import type { ModelTier } from '../../../domain/routing/llm-task';
import { routeLlmTask, type RoutingThresholds } from '../../../domain/routing/policy';

/** The provider model ID for each tier, from `GEMINI_MODEL_LITE` and `GEMINI_MODEL_FLASH`. */
export type ModelsByTier = Readonly<Record<ModelTier, string>>;

/** Dependencies of {@link withRouting}. */
export interface RoutingDeps {
  thresholds: RoutingThresholds;
  models: ModelsByTier;
}

/**
 * Outermost decorator (SPEC §7.3, ADR 0010). Asks the pure routing policy for a tier, resolves
 * the tier to a model ID, and hands a routed request to the inner chain. The result carries the
 * rule that fired (`routedReason`), so ask can report it. Use cases see only
 * {@link LlmClient}, so they can't name a model.
 *
 * @example
 * const llm = withRouting(withFallback(withRetry(withCallLogging(gemini, …), …), …), { thresholds, models });
 */
export function withRouting(inner: RoutedLlmClient, deps: RoutingDeps): LlmClient {
  return {
    async generate(request: LlmRequest): Promise<LlmResult> {
      const { tier, reason } = routeLlmTask(
        request.task,
        request.routingContext ?? {},
        deps.thresholds,
      );
      const response = await inner.generate({
        ...request,
        route: { tier, model: deps.models[tier], reason, isFallback: false },
      });
      return { ...response, routedReason: reason };
    },
  };
}
