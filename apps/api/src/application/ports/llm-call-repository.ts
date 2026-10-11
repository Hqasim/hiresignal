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

/** A recorded call attempt with its row id, as the ops page lists it. */
export interface StoredLlmCall extends LlmCallRecord {
  id: number;
}

/**
 * Aggregates over a set of call attempts (SPEC §10, §17).
 *
 * Counts include every attempt, live and replayed. Tokens, the cache ratio and latency cover
 * `live` attempts only: a replayed call reads a fixture in about 0 ms and reports no real usage,
 * so mixing it in would hide what Gemini actually did.
 */
export interface LlmCallStats {
  calls: number;
  live: number;
  replay: number;
  /** Attempts whose status isn't `ok`: errors, rate limits and timeouts. */
  errors: number;
  /** Attempts made on the fallback tier after the routed tier failed. */
  fallbacks: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Cached ÷ input tokens over live calls that reported usage; `null` when there were none. */
  cacheRatio: number | null;
  /** Median live latency (`percentile_cont`); `null` without live calls. */
  p50LatencyMs: number | null;
  /** 95th-percentile live latency; `null` without live calls. */
  p95LatencyMs: number | null;
}

/** {@link LlmCallStats} for one model. */
export interface LlmModelStats extends LlmCallStats {
  model: string;
  tier: LlmCallTier;
}

/** How many generation attempts one routing rule sent to one tier. */
export interface LlmRouteCount {
  tier: ModelTier;
  /** The routing rule, for example `default` or `comparative-intent`. */
  routedReason: string;
  calls: number;
}

/** The ops summary's numbers for a time window. */
export interface LlmCallSummary {
  totals: LlmCallStats;
  /** One entry per model, ordered by tier, then model. */
  byModel: LlmModelStats[];
  /** Generation attempts by tier and routing rule, most frequent first; embeddings aren't routed. */
  routeMix: LlmRouteCount[];
}

/** The AI telemetry log (`llm_calls`). */
export interface LlmCallRepository {
  /** Appends one call attempt. */
  record(call: LlmCallRecord): Promise<void>;
  /** Counts `live` attempts at or after `since`; the daily-cap middleware passes UTC midnight. */
  countLiveSince(since: Date): Promise<number>;
  /** Aggregates the attempts at or after `since`, computed by the database (`/api/ops/summary`). */
  summary(since: Date): Promise<LlmCallSummary>;
  /** The `limit` most recent attempts, newest first (`/api/ops/calls`). */
  recent(limit: number): Promise<StoredLlmCall[]>;
}
