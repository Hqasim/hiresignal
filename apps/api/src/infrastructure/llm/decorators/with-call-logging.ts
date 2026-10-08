import { LlmCallError } from '../../../application/llm/llm-call-error';
import type { Clock } from '../../../application/ports/clock';
import type { Embedder } from '../../../application/ports/embedder';
import type {
  LlmCallRecord,
  LlmCallRepository,
  LlmCallSource,
  LlmCallStatus,
} from '../../../application/ports/llm-call-repository';
import type { LlmResponse, LlmUsage } from '../../../application/ports/llm-client';
import type { Logger } from '../../../application/ports/logger';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../../application/ports/routed-llm-client';
import type { RedactedText } from '../../../domain/redaction/redacted-text';
import type { EmbeddingTask } from '../../../domain/routing/llm-task';
import type { UnitVector } from '../../../domain/vectors/unit-vector';

/** Dependencies of {@link withCallLogging} and {@link withEmbeddingCallLogging}. */
export interface CallLoggingDeps {
  calls: LlmCallRepository;
  clock: Clock;
  /** `live` when the innermost client reaches Gemini (live and record modes), else `replay`. */
  source: LlmCallSource;
  /** Reports a failed telemetry write; the model call itself still succeeds. */
  logger: Logger;
}

/**
 * Innermost decorator (SPEC §7.3, §17): writes one `llm_calls` row per attempt, successful or
 * not, so retries and fallbacks are visible on the ops page and count toward the daily cap.
 * Rows hold metadata only (tokens, latency, route, status), never prompts or output.
 *
 * A failed telemetry write is logged as `llm.call_log_failed` and doesn't fail the call: losing
 * one row is better than discarding a model response the user is waiting for.
 *
 * @example
 * const logged = withCallLogging(gemini, { calls, clock, source: 'live', logger });
 */
export function withCallLogging(inner: RoutedLlmClient, deps: CallLoggingDeps): RoutedLlmClient {
  return {
    async generate(request: RoutedLlmRequest): Promise<LlmResponse> {
      const started = deps.clock.now().getTime();
      const base = {
        requestId: request.requestId ?? null,
        task: request.task,
        model: request.route.model,
        tier: request.route.tier,
        routedReason: request.route.reason,
        isFallback: request.route.isFallback,
        source: deps.source,
        promptVersion: request.promptVersion,
      } as const;
      try {
        const response = await inner.generate(request);
        await record(deps, { ...base, ...finish(deps, started, 'ok', response.usage) });
        return response;
      } catch (error) {
        await record(deps, { ...base, ...finish(deps, started, statusOf(error), null) });
        throw error;
      }
    },
  };
}

/** Dependencies of {@link withEmbeddingCallLogging}. */
export interface EmbeddingCallLoggingDeps extends CallLoggingDeps {
  /** `GEMINI_EMBEDDING_MODEL`. */
  model: string;
  /** The adapter's input format version, stored as the prompt version (`GEMINI_EMBEDDING_INPUT_FORMAT`). */
  inputFormat: string;
}

/**
 * {@link withCallLogging} for the {@link Embedder}: one `llm_calls` row per call, with tier
 * `embedding`. The embedding API reports no token usage, so token columns are null.
 *
 * @example
 * const embedder = withEmbeddingCallLogging(gemini, { calls, clock, source, logger, model, inputFormat });
 */
export function withEmbeddingCallLogging(
  inner: Embedder,
  deps: EmbeddingCallLoggingDeps,
): Embedder {
  async function logged<T>(task: EmbeddingTask, call: () => Promise<T>): Promise<T> {
    const started = deps.clock.now().getTime();
    const base = {
      requestId: null,
      task,
      model: deps.model,
      tier: 'embedding',
      routedReason: 'default',
      isFallback: false,
      source: deps.source,
      promptVersion: deps.inputFormat,
    } as const;
    try {
      const result = await call();
      await record(deps, { ...base, ...finish(deps, started, 'ok', null) });
      return result;
    } catch (error) {
      await record(deps, { ...base, ...finish(deps, started, statusOf(error), null) });
      throw error;
    }
  }

  return {
    embedDocuments: (texts: readonly RedactedText[]): Promise<UnitVector[]> =>
      logged('embed.documents', () => inner.embedDocuments(texts)),
    embedQuery: (text: string): Promise<UnitVector> =>
      logged('embed.query', () => inner.embedQuery(text)),
  };
}

type Outcome = Pick<
  LlmCallRecord,
  'status' | 'inputTokens' | 'outputTokens' | 'cachedTokens' | 'latencyMs' | 'createdAt'
>;

function finish(
  deps: CallLoggingDeps,
  started: number,
  status: LlmCallStatus,
  usage: LlmUsage | null,
): Outcome {
  const createdAt = deps.clock.now();
  return {
    status,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    cachedTokens: usage?.cachedTokens ?? null,
    latencyMs: createdAt.getTime() - started,
    createdAt,
  };
}

function statusOf(error: unknown): LlmCallStatus {
  if (error instanceof LlmCallError) {
    if (error.reason === 'rate_limited') return 'rate_limited';
    if (error.reason === 'timeout') return 'timeout';
  }
  return 'error';
}

async function record(deps: CallLoggingDeps, call: LlmCallRecord): Promise<void> {
  try {
    await deps.calls.record(call);
  } catch (error) {
    deps.logger.error('llm.call_log_failed', error, { task: call.task, status: call.status });
  }
}
