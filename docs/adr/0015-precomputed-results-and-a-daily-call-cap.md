# 0015. Precomputed results and a daily call cap

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

The demo is public and unauthenticated (SPEC §18), and it runs on a free Gemini key with per-minute and per-day limits that Google doesn't publish. Screening one candidate takes about 10–20 model and embedding calls and, live, tens of seconds. Two things follow:

- **The first impression can't depend on Gemini.** A visitor opening the candidate list should see ranked scorecards instantly, even if the key is exhausted or Gemini is slow.
- **One visitor, or a script, could exhaust the key.** Every visitor after them would then get errors (LLM10, unbounded consumption).

## Decision

**Precompute.** `npm run seed` stores a scorecard for every non-quarantined candidate ([`createScreenPool`](../../apps/api/src/application/screening/screen-pool.ts)), replayed from committed fixtures (ADR 0009). Production is seeded the same way, in replay mode, with zero Gemini calls (Phase 10). Every read route (`GET /jobs/…`, `GET /candidates/:id`, shortlisting) serves stored data and never calls a model.

**Cap live work.** Only routes that call the LLM (`POST /candidates/:id/screen` now, and `POST /jobs/:slug/ask` in Phase 6) pass through [`dailyCap`](../../apps/api/src/interfaces/http/middleware/daily-cap.ts). It runs [`createCheckDailyCap`](../../apps/api/src/application/quota/check-daily-cap.ts) first, which counts today's `live` rows in `llm_calls` since UTC midnight (from the injected `Clock`). At `DAILY_LLM_CALL_CAP` (300 by default, an env variable) the request is refused with a 429 problem carrying `retryAfter`, plus a `Retry-After` header: the seconds until the next UTC midnight. Replayed calls never count.

The cap was planned for Phase 7, but it was built in Phase 5 with the first LLM route, so that route has never existed uncapped (agreed in the Phase 5 plan).

## Consequences

- **Positive:**
  - The demo works fully with no Gemini key at all: precomputed scorecards, the list, the detail page and shortlisting.
  - Exhausting the key costs visitors only the live re-screen (and later Ask); the UI can explain the 429 with the reset time.
  - The count reuses the telemetry table every call already writes, so there's no extra state, counter or table.
  - `Clock` injection makes the midnight rollover testable without waiting.
- **Negative:**
  - The check runs before a request, and one screening makes many calls, so the day can end slightly over the cap: at most one request's worth.
  - It counts calls, not tokens. A cap on tokens would track cost better on a paid key.
  - Concurrent requests can both pass the check at cap − 1. Acceptable at demo traffic; a strict cap would need a lock or an atomic counter.
  - The cap is global, not per visitor, so one heavy user can use up everyone's quota for the day. Per-IP limits would need state the Lambda doesn't keep.

## Alternatives considered

- **Live screening on page load.** Rejected: it is slow, it depends on Gemini being available, and it would burn the free quota on every visit.
- **Gemini's own quota errors as the only limit.** Rejected: the 429s would arrive mid-screening and leave partial work, and the limit is unpublished and shared with seeding.
- **API Gateway usage plans or AWS WAF rate rules.** Rejected: they cost money or add infrastructure beyond SPEC §16, and the Function URL has no usage plans.
- **An in-memory counter in the Lambda.** Rejected: every concurrent instance and cold start would have its own count.
