import type { ModelTier } from '../../domain/routing/llm-task';
import type { RoutingReason } from '../../domain/routing/policy';
import type { LlmRequest, LlmResponse } from './llm-client';

/** Where the routing decorator sent a call, and why. Logged with every attempt. */
export interface LlmRoute {
  tier: ModelTier;
  /** The provider model ID for `tier`, from env (`GEMINI_MODEL_LITE` or `GEMINI_MODEL_FLASH`). */
  model: string;
  reason: RoutingReason;
  /** True when the fallback decorator switched tiers after the routed tier failed. */
  isFallback: boolean;
}

/** A request after routing: it carries the model to call. */
export interface RoutedLlmRequest extends LlmRequest {
  route: LlmRoute;
}

/**
 * The inner side of the decorator chain (fallback, retry, call logging, and the Gemini,
 * recording and replay clients). Its own type means an unrouted request can't reach a provider:
 * only `withRouting` turns an `LlmClient` request into a routed one (ADR 0010).
 */
export interface RoutedLlmClient {
  /**
   * Generates one model turn with the model named in `request.route`.
   *
   * @throws LlmCallError for provider failures; `retryable` tells the decorators what to do.
   * @throws FixtureMissingError in replay mode when no recording matches the request.
   */
  generate(request: RoutedLlmRequest): Promise<LlmResponse>;
}
