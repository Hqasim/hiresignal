import { LlmUnavailableError } from '../../../application/errors/llm-unavailable-error';
import { LlmCallError } from '../../../application/llm/llm-call-error';
import type { LlmResponse } from '../../../application/ports/llm-client';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../../application/ports/routed-llm-client';
import type { ModelTier } from '../../../domain/routing/llm-task';
import { assertNever } from '../../../domain/shared/assert-never';
import type { ModelsByTier } from './with-routing';

/** Dependencies of {@link withFallback}. */
export interface FallbackDeps {
  models: ModelsByTier;
}

/**
 * Switches tier once when the routed tier keeps failing transiently (SPEC §9.1, ADR 0010).
 * Free-tier quotas are per model, so a rate-limited Flash-Lite often leaves Flash available,
 * and the reverse.
 *
 * - A retryable failure (after `withRetry` gave up) is retried once on the other tier, marked
 *   `isFallback`.
 * - If the fallback also fails transiently, the caller gets {@link LlmUnavailableError} (HTTP 503).
 * - Non-retryable failures pass through untouched: a rejected request fails the same on any tier.
 *
 * @example
 * const resilient = withFallback(withRetry(logged, retryDeps), { models });
 */
export function withFallback(inner: RoutedLlmClient, deps: FallbackDeps): RoutedLlmClient {
  return {
    async generate(request: RoutedLlmRequest): Promise<LlmResponse> {
      try {
        return await inner.generate(request);
      } catch (error) {
        if (!isRetryable(error) || request.route.isFallback) {
          throw error;
        }
        const tier = otherTier(request.route.tier);
        try {
          return await inner.generate({
            ...request,
            route: { ...request.route, tier, model: deps.models[tier], isFallback: true },
          });
        } catch (fallbackError) {
          if (isRetryable(fallbackError)) {
            throw new LlmUnavailableError(
              'The AI model is busy or unavailable right now. Try again in a minute.',
              { cause: fallbackError },
            );
          }
          throw fallbackError;
        }
      }
    },
  };
}

function isRetryable(error: unknown): boolean {
  return error instanceof LlmCallError && error.retryable;
}

function otherTier(tier: ModelTier): ModelTier {
  switch (tier) {
    case 'lite':
      return 'flash';
    case 'flash':
      return 'lite';
    default:
      return assertNever(tier);
  }
}
