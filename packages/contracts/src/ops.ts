import { z } from 'zod';

/** The tier a call used: the two generation tiers, or the embedding model. */
export const LlmCallTierSchema = z.enum(['lite', 'flash', 'embedding']);
export type LlmCallTier = z.infer<typeof LlmCallTierSchema>;

const count = z.int().nonnegative();
const milliseconds = z.number().nonnegative();

/**
 * Aggregates over a set of model call attempts. Counts include live and replayed attempts;
 * tokens, `cacheRatio` and the latency percentiles cover live attempts only, because a replay
 * reads a recorded fixture and reports no real usage. Strict, so no content field can slip in.
 */
export const LlmCallStatsSchema = z.strictObject({
  calls: count,
  live: count,
  replay: count,
  /** Attempts that ended in an error, rate limit or timeout. */
  errors: count,
  /** Attempts on the fallback tier after the routed tier failed. */
  fallbacks: count,
  inputTokens: count,
  outputTokens: count,
  cachedTokens: count,
  /** Cached ÷ input tokens, 0–1; `null` without live usage. */
  cacheRatio: z.number().min(0).max(1).nullable(),
  p50LatencyMs: milliseconds.nullable(),
  p95LatencyMs: milliseconds.nullable(),
});
export type LlmCallStats = z.infer<typeof LlmCallStatsSchema>;

/** {@link LlmCallStatsSchema} for one model. */
export const LlmModelStatsSchema = LlmCallStatsSchema.extend({
  model: z.string().min(1),
  tier: LlmCallTierSchema,
});
export type LlmModelStats = z.infer<typeof LlmModelStatsSchema>;

/** Generation attempts one routing rule sent to one tier. */
export const RouteCountSchema = z.strictObject({
  tier: z.enum(['lite', 'flash']),
  /** The rule that picked the tier, for example `default` or `comparative-intent`. */
  routedReason: z.string().min(1),
  calls: count,
});
export type RouteCount = z.infer<typeof RouteCountSchema>;

/**
 * Response of `GET /api/ops/summary`: today's AI telemetry, in UTC days like the daily cap
 * (SPEC §10, §17). Computed from `llm_calls` with SQL aggregates.
 */
export const OpsSummarySchema = z.strictObject({
  /** The UTC day the numbers cover, `YYYY-MM-DD`. */
  day: z.iso.date(),
  generatedAt: z.iso.datetime(),
  /** Live calls used today against `DAILY_LLM_CALL_CAP`, and when the count resets. */
  cap: z.strictObject({ used: count, limit: count, resetsAt: z.iso.datetime() }),
  totals: LlmCallStatsSchema,
  /** One entry per model, ordered by tier, then model. */
  byModel: z.array(LlmModelStatsSchema),
  /** Generation attempts by tier and routing rule, most frequent first. */
  routeMix: z.array(RouteCountSchema),
});
export type OpsSummary = z.infer<typeof OpsSummarySchema>;

/**
 * One model call attempt in `GET /api/ops/calls`: metadata only, never prompts, resume text or
 * model output. Strict, so a content field fails validation.
 */
export const LlmCallRowSchema = z.strictObject({
  id: z.int().positive(),
  /** The HTTP request that caused the call; `null` for CLI runs such as seeding. */
  requestId: z.string().nullable(),
  /** The task, for example `ask.answer` or `embed.query`. */
  task: z.string().min(1),
  model: z.string().min(1),
  tier: LlmCallTierSchema,
  routedReason: z.string().min(1),
  isFallback: z.boolean(),
  source: z.enum(['live', 'replay']),
  status: z.enum(['ok', 'error', 'rate_limited', 'timeout']),
  inputTokens: count.nullable(),
  outputTokens: count.nullable(),
  cachedTokens: count.nullable(),
  latencyMs: count,
  promptVersion: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type LlmCallRow = z.infer<typeof LlmCallRowSchema>;

/** Response of `GET /api/ops/calls?limit=`: the most recent attempts, newest first. */
export const LlmCallListResponseSchema = z.strictObject({ calls: z.array(LlmCallRowSchema) });
export type LlmCallListResponse = z.infer<typeof LlmCallListResponseSchema>;
