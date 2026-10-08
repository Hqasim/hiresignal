import type { LlmClient, LlmRequest, LlmResponse } from '../../../application/ports/llm-client';
import type { LlmRoute, RoutedLlmClient } from '../../../application/ports/routed-llm-client';

/**
 * Sends every request to one fixed route, bypassing the routing policy. Only `npm run llm:smoke`
 * uses it, to check each tier's model ID directly; production code always goes through
 * `withRouting`.
 *
 * @example
 * const flash = withPinnedRoute(recorded, { tier: 'flash', model, reason: 'default', isFallback: false });
 */
export function withPinnedRoute(inner: RoutedLlmClient, route: LlmRoute): LlmClient {
  return {
    generate: (request: LlmRequest): Promise<LlmResponse> => inner.generate({ ...request, route }),
  };
}
