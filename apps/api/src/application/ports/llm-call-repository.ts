import type { EmbeddingTask, LlmTask, ModelTier } from '../../domain/routing/llm-task';

/** The model tier a call used; embeddings are logged as their own tier. */
export type LlmCallTier = ModelTier | 'embedding';

/** Whether a call reached Gemini (`live`, which counts toward the daily cap) or a fixture (`replay`). */
export type LlmCallSource = 'live' | 'replay';

/** How one attempt ended. */
export type LlmCallStatus = 'ok' | 'error' | 'rate_limited' | 'timeout';

/**
 * One model call attempt, as the call-logging decorator records it (SPEC §7.3, §17). Metadata
 * only: never prompts, resume text or model output.
 */
export interface LlmCallRecord {
  /** The HTTP request that caused the call; `null` for CLI runs such as seeding. */
  requestId: string | null;
  task: LlmTask | EmbeddingTask;
  model: string;
  tier: LlmCallTier;
  /** Which routing rule picked the tier, for example `default` or `comparative-intent`. */
  routedReason: string;
  isFallback: boolean;
  source: LlmCallSource;
  status: LlmCallStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  latencyMs: number;
  promptVersion: string | null;
  /** When the attempt finished, from the injected `Clock`. */
  createdAt: Date;
}

/** The AI telemetry log (`llm_calls`). Phase 7 adds the ops summary and recent-calls queries. */
export interface LlmCallRepository {
  /** Appends one call attempt. */
  record(call: LlmCallRecord): Promise<void>;
  /** Counts `live` attempts at or after `since`; the daily-cap middleware passes UTC midnight. */
  countLiveSince(since: Date): Promise<number>;
}
