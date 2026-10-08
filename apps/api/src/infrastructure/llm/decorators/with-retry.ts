import { LlmCallError } from '../../../application/llm/llm-call-error';
import type { LlmResponse } from '../../../application/ports/llm-client';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../../application/ports/routed-llm-client';

/** Dependencies of {@link withRetry}. Time and randomness are injected so tests never sleep. */
export interface RetryDeps {
  /** Retries after the first attempt (`LLM_MAX_RETRIES`). */
  maxRetries: number;
  /** Backoff before the first retry, before jitter (`LLM_RETRY_BASE_DELAY_MS`). */
  baseDelayMs: number;
  /** Longest wait honoured; a longer server-requested delay skips the retry (`LLM_RETRY_MAX_DELAY_MS`). */
  maxDelayMs: number;
  sleep(ms: number): Promise<void>;
  /** Uniform in [0, 1), like `Math.random`. */
  random(): number;
}

/**
 * Retries transient failures on the same tier (SPEC §7.3): HTTP 429, 5xx and timeouts only.
 *
 * - A server-requested delay (`retryAfterMs`) is honoured exactly, unless it exceeds
 *   `maxDelayMs`. Then the error is rethrown at once so `withFallback` can try the other tier
 *   instead of the Lambda sleeping through its timeout.
 * - Otherwise the delay is exponential, `baseDelayMs × 2^attempt` capped at `maxDelayMs`, with
 *   "equal jitter" (between half and all of it) so concurrent callers don't retry in lockstep.
 *
 * @example
 * const retried = withRetry(logged, { maxRetries: 1, baseDelayMs: 1000, maxDelayMs: 10_000, sleep, random: Math.random });
 */
export function withRetry(inner: RoutedLlmClient, deps: RetryDeps): RoutedLlmClient {
  return {
    async generate(request: RoutedLlmRequest): Promise<LlmResponse> {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await inner.generate(request);
        } catch (error) {
          const delayMs = attempt < deps.maxRetries ? retryDelayMs(error, attempt, deps) : null;
          if (delayMs === null) {
            throw error;
          }
          await deps.sleep(delayMs);
        }
      }
    },
  };
}

/** How long to wait before retrying, or `null` when the error must not be retried here. */
function retryDelayMs(error: unknown, attempt: number, deps: RetryDeps): number | null {
  if (!(error instanceof LlmCallError) || !error.retryable) {
    return null;
  }
  if (error.retryAfterMs !== undefined) {
    return error.retryAfterMs <= deps.maxDelayMs ? error.retryAfterMs : null;
  }
  const exponential = Math.min(deps.maxDelayMs, deps.baseDelayMs * 2 ** attempt);
  return Math.round(exponential / 2 + (exponential / 2) * deps.random());
}
