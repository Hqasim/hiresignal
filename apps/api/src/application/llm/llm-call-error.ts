import type { EmbeddingTask, LlmTask } from '../../domain/routing/llm-task';

/**
 * Why a provider call failed.
 *
 * - `rate_limited`: HTTP 429, quota exhausted for now.
 * - `unavailable`: HTTP 500, 503 or 504, or a network failure; the provider is overloaded or down.
 * - `timeout`: the attempt exceeded `LLM_TIMEOUT_MS`.
 * - `rejected`: any other 4xx, or a malformed reply; retrying the same request won't help.
 */
export type LlmFailureReason = 'rate_limited' | 'unavailable' | 'timeout' | 'rejected';

/** Options for {@link LlmCallError}. */
export interface LlmCallErrorOptions {
  reason: LlmFailureReason;
  task: LlmTask | EmbeddingTask;
  /** Server-requested wait before retrying, parsed from the provider's error body. */
  retryAfterMs?: number;
  cause?: unknown;
}

/**
 * A failed provider call, in provider-neutral terms. Adapters throw it; the retry and fallback
 * decorators read `retryable`. It isn't an `AppError`: when retries and fallback are exhausted,
 * `withFallback` raises `LlmUnavailableError`, and a `rejected` call surfaces as a generic 500
 * because it means our request was wrong. The message never contains prompts or model output.
 */
export class LlmCallError extends Error {
  readonly reason: LlmFailureReason;
  readonly task: LlmTask | EmbeddingTask;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: LlmCallErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'LlmCallError';
    this.reason = options.reason;
    this.task = options.task;
    this.retryAfterMs = options.retryAfterMs;
  }

  /** Whether the same request might succeed later: rate limits, outages and timeouts. */
  get retryable(): boolean {
    return this.reason !== 'rejected';
  }
}
