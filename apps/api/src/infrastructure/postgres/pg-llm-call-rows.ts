import { z } from 'zod';

import type {
  LlmCallStats,
  LlmModelStats,
  LlmRouteCount,
  StoredLlmCall,
} from '../../application/ports/llm-call-repository';
import { EmbeddingTaskSchema, LlmTaskSchema, ModelTierSchema } from '../../domain/routing/llm-task';

const TierSchema = z.enum(['lite', 'flash', 'embedding']);

/**
 * The aggregate columns shared by the totals and per-model queries. Counts cover every attempt;
 * tokens, the cache ratio and latency cover live attempts only (see `LlmCallStats`).
 *
 * - `sum` and `count` return `bigint`, which node-postgres reads as a string, so they are cast.
 * - `percentile_cont` interpolates between the two nearest latencies and returns `float8`. It
 *   ignores rows the `filter` excludes and returns null when none are left.
 * - The cache ratio divides by `nullif(…, 0)`, so a window without usage gives null, not an error.
 */
export const STATS_COLUMNS = `
  count(*)::int as calls,
  count(*) filter (where source = 'live')::int as live,
  count(*) filter (where source = 'replay')::int as replay,
  count(*) filter (where status <> 'ok')::int as errors,
  count(*) filter (where is_fallback)::int as fallbacks,
  coalesce(sum(input_tokens) filter (where source = 'live'), 0)::int as input_tokens,
  coalesce(sum(output_tokens) filter (where source = 'live'), 0)::int as output_tokens,
  coalesce(sum(cached_tokens) filter (where source = 'live'), 0)::int as cached_tokens,
  sum(coalesce(cached_tokens, 0)) filter (where source = 'live' and input_tokens is not null)::float8
    / nullif(sum(input_tokens) filter (where source = 'live'), 0) as cache_ratio,
  percentile_cont(0.5) within group (order by latency_ms) filter (where source = 'live')
    as p50_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms) filter (where source = 'live')
    as p95_latency_ms`;

const count = z.number().int().nonnegative();

/** A row of {@link STATS_COLUMNS}. */
export const StatsRowSchema = z.object({
  calls: count,
  live: count,
  replay: count,
  errors: count,
  fallbacks: count,
  input_tokens: count,
  output_tokens: count,
  cached_tokens: count,
  cache_ratio: z.number().nonnegative().nullable(),
  p50_latency_ms: z.number().nonnegative().nullable(),
  p95_latency_ms: z.number().nonnegative().nullable(),
});
type StatsRow = z.infer<typeof StatsRowSchema>;

/** A per-model row: {@link STATS_COLUMNS} plus the group keys. */
export const ModelStatsRowSchema = StatsRowSchema.extend({ model: z.string(), tier: TierSchema });

/** A route-mix row. */
export const RouteCountRowSchema = z.object({
  tier: ModelTierSchema,
  routed_reason: z.string(),
  calls: count,
});

/** Every column of `llm_calls`, in the order {@link CallRowSchema} lists them. */
export const CALL_COLUMNS = `id::text as id, request_id, task, model, tier, routed_reason, is_fallback,
  source, status, input_tokens, output_tokens, cached_tokens, latency_ms, prompt_version, created_at`;

const tokens = z.number().int().nonnegative().nullable();

/** An `llm_calls` row. The identity id is a `bigint`, read as text and parsed. */
export const CallRowSchema = z.object({
  id: z.coerce.number().int().positive(),
  request_id: z.string().nullable(),
  task: z.union([LlmTaskSchema, EmbeddingTaskSchema]),
  model: z.string(),
  tier: TierSchema,
  routed_reason: z.string(),
  is_fallback: z.boolean(),
  source: z.enum(['live', 'replay']),
  status: z.enum(['ok', 'error', 'rate_limited', 'timeout']),
  input_tokens: tokens,
  output_tokens: tokens,
  cached_tokens: tokens,
  latency_ms: z.number().int().nonnegative(),
  prompt_version: z.string().nullable(),
  created_at: z.date(),
});

/** Maps a validated {@link StatsRowSchema} row. */
export function toStats(row: StatsRow): LlmCallStats {
  return {
    calls: row.calls,
    live: row.live,
    replay: row.replay,
    errors: row.errors,
    fallbacks: row.fallbacks,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    cacheRatio: row.cache_ratio,
    p50LatencyMs: row.p50_latency_ms,
    p95LatencyMs: row.p95_latency_ms,
  };
}

/** Maps a validated {@link ModelStatsRowSchema} row. */
export function toModelStats(row: z.infer<typeof ModelStatsRowSchema>): LlmModelStats {
  return { model: row.model, tier: row.tier, ...toStats(row) };
}

/** Maps a validated {@link RouteCountRowSchema} row. */
export function toRouteCount(row: z.infer<typeof RouteCountRowSchema>): LlmRouteCount {
  return { tier: row.tier, routedReason: row.routed_reason, calls: row.calls };
}

/** Maps a validated {@link CallRowSchema} row. */
export function toStoredCall(row: z.infer<typeof CallRowSchema>): StoredLlmCall {
  return {
    id: row.id,
    requestId: row.request_id,
    task: row.task,
    model: row.model,
    tier: row.tier,
    routedReason: row.routed_reason,
    isFallback: row.is_fallback,
    source: row.source,
    status: row.status,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    latencyMs: row.latency_ms,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
  };
}
