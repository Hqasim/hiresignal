import type { Clock } from '../../../application/ports/clock';
import type { Embedder } from '../../../application/ports/embedder';
import type { LlmResponse } from '../../../application/ports/llm-client';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../../application/ports/routed-llm-client';
import type { RedactedText } from '../../../domain/redaction/redacted-text';
import type { UnitVector } from '../../../domain/vectors/unit-vector';

/** Spaces out provider calls; one throttle can be shared by several clients. */
export interface Throttle {
  /** Resolves when the next call may start, and reserves that slot. */
  wait(): Promise<void>;
}

/** Dependencies of {@link createThrottle}. */
export interface ThrottleDeps {
  /** `SEED_MIN_CALL_INTERVAL_MS`: the minimum time between the starts of two calls. */
  minIntervalMs: number;
  clock: Clock;
  /** Waits `ms` milliseconds; tests pass a fake that advances a fake clock. */
  sleep: (ms: number) => Promise<void>;
}

/**
 * A throttle that starts calls at least `minIntervalMs` apart, so a live seed run stays under the
 * free tier's per-minute limits (SPEC §21 risk 1). The first call starts at once. Slots are
 * reserved when `wait()` is called, so concurrent callers queue in order.
 *
 * @example
 * const throttle = createThrottle({ minIntervalMs: 6000, clock, sleep });
 */
export function createThrottle(deps: ThrottleDeps): Throttle {
  let nextStart = Number.NEGATIVE_INFINITY;
  return {
    async wait(): Promise<void> {
      const now = deps.clock.now().getTime();
      const start = Math.max(now, nextStart);
      nextStart = start + deps.minIntervalMs;
      if (start > now) {
        await deps.sleep(start - now);
      }
    },
  };
}

/**
 * Throttles generation calls. It sits innermost, just above the provider client, so retries and
 * fallback attempts are spaced out too. Only record and live seeding use it.
 *
 * @example
 * const throttled = withThrottle(gemini.llm, throttle);
 */
export function withThrottle(inner: RoutedLlmClient, throttle: Throttle): RoutedLlmClient {
  return {
    async generate(request: RoutedLlmRequest): Promise<LlmResponse> {
      await throttle.wait();
      return inner.generate(request);
    },
  };
}

/**
 * Throttles embedding calls with the same throttle as generation. One `embedDocuments` call counts
 * once even though the adapter may split it into batches; a resume has fewer chunks than
 * `EMBEDDING_BATCH_SIZE`, so in practice it is one request.
 *
 * @example
 * const throttled = withEmbeddingThrottle(gemini.embedder, throttle);
 */
export function withEmbeddingThrottle(inner: Embedder, throttle: Throttle): Embedder {
  return {
    async embedDocuments(texts: readonly RedactedText[]): Promise<UnitVector[]> {
      await throttle.wait();
      return inner.embedDocuments(texts);
    },
    async embedQuery(text: string): Promise<UnitVector> {
      await throttle.wait();
      return inner.embedQuery(text);
    },
  };
}
