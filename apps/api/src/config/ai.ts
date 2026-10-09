// AI tunables (SPEC §7.5). Each value has a reason; change one only with evidence from an eval or
// a measured failure, and say why in the commit. Model IDs and the daily call cap are env vars
// (`config/env.ts`), because they differ between environments.

/**
 * Embedding size. Under pgvector's 2,000-dimension HNSW limit, small to store, and a size
 * `gemini-embedding-2` normalizes itself (ADR 0007).
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Documents per embedding request. 16 chunks of at most `CHUNK_MAX_TOKENS` plus their context
 * headers and prefixes stay under `gemini-embedding-2`'s 8,192 input tokens, even if that limit
 * turns out to apply to the whole request rather than to each input.
 */
export const EMBEDDING_BATCH_SIZE = 16;

/** Target chunk size: one role or section per chunk, far below the embedder's input limit. */
export const CHUNK_MAX_TOKENS = 350;

/** Chunks each retrieval arm (vector, keyword) contributes before rank fusion. */
export const RETRIEVAL_POOL_PER_ARM = 20;

/** The standard reciprocal-rank-fusion damping constant from Cormack et al. (2009). */
export const RRF_K = 60;

/** Chunks passed to the answer model: enough to span several candidates, small enough for Flash-Lite. */
export const ASK_TOP_K = 12;

/** Chunks returned per `search_resume` call, so one agent step reads a focused slice. */
export const AGENT_SEARCH_TOP_K = 4;

/** Hard bound on screening-agent turns, so a confused or injected agent can't loop (LLM06, LLM10). */
export const MAX_AGENT_STEPS = 8;

/**
 * Below this best cosine similarity, ask answers "insufficient evidence" without an LLM call.
 * A starting value, tuned on the seeded data in Phase 6.
 */
export const SIMILARITY_FLOOR = 0.55;

/**
 * Implicit-cache minimum for current Flash models. The screening-prefix test asserts the prefix
 * is at least this long, plus a margin (SPEC §9.2).
 */
export const CACHE_MIN_PREFIX_TOKENS = 4096;

/** Ask escalates to Flash when the retrieved context is larger than this (SPEC §9.1). */
export const ASK_ESCALATION_CONTEXT_TOKENS = 3000;

/** Ask escalates to Flash when the context spans more candidates than this (SPEC §9.1). */
export const ASK_ESCALATION_CANDIDATES = 3;

/** Minimum classifier confidence for a "malicious" verdict to quarantine a resume (SPEC §9.4). */
export const CLASSIFIER_QUARANTINE_CONFIDENCE = 0.7;

/**
 * Output budget for one `guard.classify` call. The reply is an enum, a number and at most 300
 * characters of rationale (under 100 tokens), but Gemini 3 thinking tokens count toward the limit
 * (288 for a 20-token reply in the Phase 2 smoke check), so it leaves room for both.
 */
export const CLASSIFIER_MAX_OUTPUT_TOKENS = 1024;

/**
 * Per-attempt timeout. Two attempts plus a fallback attempt and backoff still fit inside the
 * Lambda's 60 s limit only when the provider fails fast, which 429s and 503s do; a timeout is the
 * slow path, so it is kept well under half of 60 s.
 */
export const LLM_TIMEOUT_MS = 25_000;

/** Retries per tier before falling back (SPEC §7.3). One keeps the worst case inside the Lambda timeout. */
export const LLM_MAX_RETRIES = 1;

/** First backoff delay before jitter. Long enough for a momentary 503 to clear. */
export const LLM_RETRY_BASE_DELAY_MS = 1000;

/**
 * Longest wait the retry decorator will honour. A 429 asking for longer (free-tier per-minute
 * quotas often ask for 30 s or more) skips the wait and goes straight to the fallback tier, which
 * has its own quota, instead of spending the Lambda's 60 s on sleeping.
 */
export const LLM_RETRY_MAX_DELAY_MS = 10_000;

/**
 * Output budget for each `npm run llm:smoke` generation. The reply is a few tokens, but Gemini 3
 * thinking tokens count toward the limit, so it leaves generous headroom.
 */
export const SMOKE_MAX_OUTPUT_TOKENS = 2048;
