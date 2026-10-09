# 0010. Rule-based routing with tier fallback

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

HireSignal makes five kinds of generation (SPEC §9.1). They differ a lot in what they need:

- **Guard classification and agent tool selection** are short and frequent. Flash-Lite handles them.
- **Scorecard synthesis and repair** need judgment over long structured output. They need Flash.
- **Ask** is usually a simple lookup, but some questions compare or rank candidates, or carry a large context, and those deserve Flash.

Everything runs on a free Gemini key. Each model has its own per-minute and per-day quota, and a demo visitor shouldn't see a 429 because one model is busy. Use cases shouldn't know model IDs at all: IDs change ([ADR 0007](0007-embedding-model-dimensions-and-normalization.md)), and replay fixtures are keyed by them ([ADR 0009](0009-record-replay-llm-adapter.md)).

## Decision

**A pure, rule-based policy picks the tier. Decorators resolve the model, retry, fall back and log.**

- **The policy** is [`routeLlmTask(task, context, thresholds)`](../../apps/api/src/domain/routing/policy.ts) in `domain/`. It returns `{ tier, reason }`:
  - Every task has a default tier.
  - Only `ask.answer` escalates to Flash. The first rule that fires wins: comparative intent (a word-bounded regex over the question), then more than `ASK_ESCALATION_CANDIDATES` candidates, then more than `ASK_ESCALATION_CONTEXT_TOKENS` tokens.
  - `reason` (`default`, `comparative-intent`, `candidate-count`, `context-size`) is stored as `llm_calls.routed_reason`.
  - Thresholds are parameters, because `domain/` can't import `config/`.
- **Two client types** ([`llm-client.ts`](../../apps/api/src/application/ports/llm-client.ts), [`routed-llm-client.ts`](../../apps/api/src/application/ports/routed-llm-client.ts)):
  - Use cases get an `LlmClient`, whose requests name a task and never a model.
  - [`withRouting`](../../apps/api/src/infrastructure/llm/decorators/with-routing.ts) is the only code that turns a request into a `RoutedLlmRequest`, which carries `route: { tier, model, reason, isFallback }`.
  - Everything inside it implements `RoutedLlmClient`: fallback, retry, call logging, and the Gemini, recording and replay clients. An unrouted request is a compile error at the provider.
- **The decorator chain**, composed only in `main/` (SPEC §7.3), outermost first:
  1. **`withRouting`:** runs the policy and maps the tier to `GEMINI_MODEL_LITE` or `GEMINI_MODEL_FLASH`.
  2. **[`withFallback`](../../apps/api/src/infrastructure/llm/decorators/with-fallback.ts):** after a retryable failure, switches tier once (lite ↔ flash) and sets `isFallback`. If the fallback also fails transiently, it raises `LlmUnavailableError` (HTTP 503). Rejected requests aren't retried on the other tier, because they would fail there too.
  3. **[`withRetry`](../../apps/api/src/infrastructure/llm/decorators/with-retry.ts):** retries once on the same tier for 429, 5xx and timeouts.
     - It honours the server's `retryDelay` up to `LLM_RETRY_MAX_DELAY_MS`. A longer delay skips the wait and goes straight to fallback, since the other model has its own quota and the Lambda has only 60 s.
     - Without a server delay, it uses exponential backoff with equal jitter.
     - `sleep` and `random` are injected.
  4. **[`withCallLogging`](../../apps/api/src/infrastructure/llm/decorators/with-call-logging.ts):** writes one `llm_calls` row per attempt, so retries and fallbacks are visible and count toward the daily cap.
- **Provider-neutral failures:** adapters translate SDK errors into `LlmCallError` with a `reason` (`rate_limited`, `unavailable`, `timeout`, `rejected`) and an optional `retryAfterMs`. The decorators never see SDK types.

## Consequences

- **Positive:**
  - Routing is deterministic, free and table-tested. No extra model call decides it, and every call records why it went where it did.
  - Swapping a model is an env change. Use cases never change.
  - The worst case is bounded: four attempts (two per tier) and at most one 10 s wait per tier. A busy model degrades to the other tier instead of an error page.
  - The type split makes "forgot to route" impossible rather than merely tested.
- **Negative:**
  - The comparative-intent regex is English-only and crude. "Who is best at Go?" escalates, which is fine, but a paraphrase like "who stands out" doesn't. The context-size and candidate-count rules catch most complex questions anyway.
  - Falling back from Flash to Flash-Lite trades quality for availability on synthesis. The row's `isFallback` flag makes that visible on the ops page.
  - The free tier's long 429 delays mean a quota-exhausted tier is skipped rather than waited for, so a burst can drain both quotas quickly. The daily call cap (Phase 7) bounds that.

## Update (2026-10-09, Phase 6)

Ask's response reports which rule routed it (SPEC §10, `routedReason`). The use case can't compute that without naming the policy itself, so `LlmClient.generate` now returns an `LlmResult`: the provider's `LlmResponse` plus the `routedReason` that `withRouting` decided ([`with-routing.ts`](../../apps/api/src/infrastructure/llm/decorators/with-routing.ts)). The inner chain is unchanged. `model` still says which model actually answered, so a fallback shows as `routedReason: comparative-intent` with the Flash-Lite model.

## Alternatives considered

- **An LLM router that classifies each request first.** Rejected: it adds a model call, with its latency, cost and quota, to every request, and makes routing nondeterministic and hard to test. The task already tells us most of what a router would learn.
- **One model for everything (Flash only).** Rejected: it burns Flash's smaller free quota on short classification calls and makes every call slower. Flash-Lite is the right tool for most of them.
- **The SDK's built-in retries (`httpOptions.retryOptions`).** Rejected: they can't switch tiers, don't read Gemini's `RetryInfo` delay, and would retry invisibly, so `llm_calls` couldn't record each attempt. One retry layer that we own is easier to reason about.
- **An optional `tier` field on `LlmRequest`, set by the router** (SPEC's first draft). Rejected in favour of the type split: an optional field lets an unrouted request reach the provider and fail at runtime.
