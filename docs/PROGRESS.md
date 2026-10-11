# Progress log

Claude Code maintains this file. It's updated at the end of every phase and read at the start of every session.

## Phases

| #   | Phase                                       | Status        | Date       | Notes                                                                            |
| --- | ------------------------------------------- | ------------- | ---------- | -------------------------------------------------------------------------------- |
| 0   | Foundations and walking skeleton            | ☑ Done        | 2026-10-08 | CI and deploy green; the live web page shows "API: healthy" from the live Lambda |
| 1   | Database and persistence                    | ☑ Done        | 2026-10-08 | Neon migrated by the deploy workflow; live health reports `db: up`               |
| 2   | LLM platform                                | ☑ Done        | 2026-10-09 | Live smoke passed on both tiers and embeddings; its fixtures replay in CI        |
| 3   | Safety layer: redaction and injection guard | ☑ Done        | 2026-10-09 | Redaction and guard ≥ 95% covered; every rule has attack and hard-negative cases |
| 4   | Synthetic data and ingestion                | ☑ Done        | 2026-10-09 | Offline replay seed in 2.5 s; all ten guard outcomes match SPEC §12              |
| 5   | Screening agent and scorecards              | ☑ Done        | 2026-10-09 | 8 scorecards, 73/73 citations verified; C01 and C02 rank first; replay in 2.1 s  |
| 6   | Ask the talent pool (hybrid RAG)            | ☑ Done        | 2026-10-10 | 23 golden questions replay offline; recall@5 = 1.000, MRR = 0.950 (hybrid)       |
| 7   | API hardening and ops endpoints             | ☑ Done        | 2026-10-11 | 12 routes, each with contract cases; one problem shape checked for every error   |
| 8   | Frontend                                    | ☑ Done        | 2026-10-12 | The §3 tour works end to end in Chrome on seeded data; 0 console errors          |
| 9   | Evals, E2E and CI hardening                 | ☐ Not started |            |                                                                                  |
| 10  | Launch and documentation                    | ☐ Not started |            |                                                                                  |

Status values: ☐ Not started · ◐ In progress · ☑ Done

## Live endpoints

- Web: https://main.dcq94s69atcgh.amplifyapp.com (Amplify app `dcq94s69atcgh`, branch `main`)
- API: https://5crt5hrdkorhfczeh4u552j3pm0vkutl.lambda-url.us-east-1.on.aws (`GET /api/health`)
- AWS stacks (`us-east-1`): `hiresignal-bootstrap` (applied by hand), `hiresignal-api` (SAM, from CI), `aws-sam-cli-managed-default`
- Neon: project `hiresignal` (`green-mouse-27720064`, `aws-us-east-1`, Postgres 18.6, pgvector 0.8.6), branch `production`, database `neondb`
  - owner `neondb_owner`: migrations, direct endpoint (`DATABASE_MIGRATION_URL`)
  - `hiresignal_app`: the Lambda, pooled endpoint (`DATABASE_URL`). Created with SQL, so it isn't in `neon_superuser`.

## Phase 8 evidence (2026-10-12)

Phase 8's DoD is local: every page works against the local API with seeded data, there are no console errors, everything is keyboard-navigable, and the component tests are green.

- **Every page works against the local API with seeded data.** The stack was `npm run db:migrate` (0 applied), `npm run seed -- --reset` in replay (`Model calls: 105 (live 0, fallbacks 0, failed 0)`) and `npm run dev`. A script drove headless Chrome 154 over the DevTools protocol through the SPEC §3 tour. (The Claude in Chrome extension wasn't connected.)
  - **`/`** redirects to `/jobs/senior-fullstack-ai`. Eight ranked rows: C01, C02 and C10 at 100 (4/4 met · 4 strong), then C05 69 (4/4 · 1 strong), C09 58, C03 50 (**4/4 met · 0 strong**), C04 50 and C08 27. C06 and C07 are in the Quarantined section, "Not scored". Seven requirements are listed.
  - **C01:** clicking a citation chip set `aria-pressed`, highlighted its quote, scrolled the quote into view inside the resume pane, and moved focus to it. Six redaction tokens show as pills, from `[PERSON_1]` to `[GRAD_YEAR_1]`. The agent trace (7 tool calls) opened from the keyboard.
  - **Shortlist** turned the heading into "Priya Raman (C01)". **Re-run screening** replayed the seed's fixture and reported "Screening finished" (score 100).
  - **C06:** two red regions labelled "Injection (L1, L2)" (the HTML comment and the white-text span), 14 highlighted segments, 8 signals in the guard panel, "No score: quarantined resumes are never scored." and no re-run button. The comment shows as literal text, `-->` included.
  - **C02** lists its dismissed `L2 · medium` signal and the classifier verdict. **C10** lists 12 redacted values in 7 types, and its L0 signal as "Not highlighted: found in the original text, before redaction."
  - **Ask:** the Q01 suggestion returned an answer from `gemini-3.5-flash-lite` (default route) with 3 citations (C05, C10, C01). Following the first opened C05 at `?cite=1177-1381` with that quote highlighted. The X01 suggestion returned "Not enough evidence" with "No model was called".
  - **Ops** showed 0 / 300 live calls, the reset at 00:00 UTC, 134 replayed attempts, "–" for the cache ratio and p95 with the reason, and 50 recent calls.
  - **About:** the links to GitHub, `/api/docs` and the docs resolve. An unknown URL shows "Page not found" inside the shell.
- **No console errors.** The final run logged 0 errors and 0 warnings across every page: 48 messages, all Vite `debug` and the React DevTools `info` notice. The first run found three problems, fixed in `fix(web): issues found walking the tour in Chrome`:
  - a React Router `HydrateFallback` warning on every load
  - a `favicon.ico` 404
  - horizontal scroll at 360 px on the jobs page (672 px) and the ops page (779 px)
- **Responsive from 360 px.** With a 360 × 780 mobile viewport, `scrollWidth` is 360 px on the jobs, C01, C06, Ask, Ops and About pages. Wide tables scroll inside their own container.
- **Keyboard-navigable.** Tab order on the jobs page: skip link, brand, the four nav links, "Full job description", the guide's two links and Dismiss, then the candidate links in rank order. On C01 the ten citation chips follow in requirement order, then the trace toggle. The script checked every focused element for a visible ring (box-shadow or outline), and none lacked one. Component tests cover Enter on a citation chip, Enter on the trace toggle, Tab to a chip, and Ctrl+Enter in Ask.
- **Component tests are green:** 109 web tests in 15 files (Phase 7: 4). The five from SPEC §14 are `ScorecardPanel` (5), `RedactedResumeView` (4, plus 15 for `segmentResume`), `AskPanel` (6), `GuardBadge` (4) and `CandidateTable` (6). The others cover the shell, error boundary and redirects, the job, candidate and ops pages, shortlist, re-run with quota, the trace, the api client, formatting and `?cite=`.
- **`npm run verify` is green:**
  - 1,277 unit tests: contracts 40, api 1,128, web 109. Phase 7 had 1,164.
  - 0 dependency-cruiser violations (426 modules)
  - every coverage gate passes
- **`npm run test:integration` passes:** 96 tests in 6 files (Phase 7: 95). The new seed test asserts C03 at 4 met / 0 strong and C01 at 4 / 4, and the `listRanked` test checks that only ids and ratings leave the JSONB.
- **Code splitting** (`npm run build`): every page is its own chunk.
  - candidate page 28.8 kB (9.6 kB gzip), ops 8.0 kB, job 7.5 kB, ask 6.2 kB, about 4.7 kB
  - the shell 373 kB (119 kB gzip), and the contracts with Zod a shared 102 kB (30 kB gzip)
- **Not pushed yet.** CI and deploy aren't part of this phase's DoD.

## Phase 7 evidence (2026-10-11)

Phase 7's DoD is local: every route is covered by contract tests, and problem+json is consistent everywhere.

- **Every route is covered by contract tests.** [`contract-coverage.test.ts`](../apps/api/src/interfaces/http/contract-coverage.test.ts) compares its table with `app.routes`: 12 routes, 34 cases. A route registered without cases fails the run.
  - Each route has a happy path, validated against its contracts schema.
  - Health and the docs have no error case. Health reports a down database as `degraded` (200), and that is tested.
  - The error cases cover 400, 404, 409, 413, 422, 429, 500 and 503 across the routes.
  - The per-route files (`routes/*.test.ts`) still test behaviour in depth. `routes/ops.test.ts` is new.
- **problem+json is consistent everywhere.** Every error case, and the unknown-route 404, asserts all of these:
  - `content-type: application/problem+json`, and a body that passes `ProblemSchema`
  - `status` equals the HTTP status
  - `type` is `urn:hiresignal:problem:<code>`
  - `instance` is the request path
  - `requestId` equals `x-request-id`
  - no stack trace, no driver message and no provider name
  - `Retry-After` matches `retryAfter` on a 429
- **The body limit also holds inside the Lambda bundle.** `npm run smoke:bundle` returns `200` for health, then `413 PAYLOAD_TOO_LARGE` for a 17 KB `POST …/ask` Function URL event. Unit tests pin the boundary: 16,384 bytes pass and 16,385 are refused, both with `content-length` and streamed without it.
- **The log serializer test** (SPEC §17): 22 denylisted keys, in mixed case, are dropped from both `info` and `error` entries. `inputTokens`, `cachedTokens`, `questionLength` and `contentHash` survive.
- **The ops SQL is checked against Postgres 18** in `test/integration/scorecard-and-llm-call-repositories.test.ts`:
  - exact `percentile_cont` results (live latencies of 50–900 ms give p50 250 and p95 775)
  - the window cutoff
  - replay rows left out of tokens and latency
  - the cache ratio (0.375)
  - the route mix
  - an empty window (zeros and nulls)
  - `recent` ordering, with the id tie-break
- **`npm run test:integration` passes:** 95 tests in 6 files (Phase 6: 89).
- **`npm run verify` is green:**
  - 1,164 unit tests: contracts 39, api 1,121, web 4. Phase 6 had 1,066.
  - 0 dependency-cruiser violations (354 modules)
  - every coverage gate passes
  - The new use cases, error handler, access log, ops and docs routes and mappers are at 100% of lines. `openapi-document.ts` is at 35/36: the uncovered line is the throw for an unknown path parameter.
- **Checked by hand** against `npm run dev` in replay mode, with the runbook's `curl.exe` commands in Windows PowerShell:
  - jobs and candidates
  - Q01 on `ask`: `gemini-3.5-flash-lite`, `default`, 3 citations
  - `POST /screen`, which replays the seed's screening of C01
  - `/api/ops/summary` and `/api/ops/calls`, which show those calls as `replay`
  - the 400, 413 and 422 problems
  - `/api/openapi.json` (25 KB) and `/api/docs`
- **The docs page renders under its CSP.** In headless Chrome, `/api/docs` loaded, Swagger UI fetched the document and rendered all 10 operations, and no error panel appeared.
- **The server log holds no request content.** Its 19 `http.request` lines carry route patterns only (`/api/jobs/:slug/ask`, …; an unknown URL logs `/*`). A grep for the questions asked found none.
- **The bundle builds:** `dist/lambda.mjs` is 3.2 MB.
- **Not pushed yet.** CI and deploy aren't part of this phase's DoD.

## Phase 6 evidence (2026-10-10)

Phase 6's DoD is local: all 20 golden questions replay offline, and recall@5 is measured and recorded here.

- **All 23 golden questions replay offline** (20 answerable, 3 out of scope, `data/evals/retrieval.jsonl`):
  - `npm run ask:golden` with `GEMINI_API_KEY` empty ends with `Model calls: 112 (live 0, fallbacks 0, failed 0)`.
  - `test/integration/ask.test.ts` replays them on a fresh database through the CLI's own wiring (`createAskGolden`) and asserts:
    - every answerable question is `answered` with at least one verified citation, and every citation's span selects exactly its quote in the cited candidate's redacted resume
    - C06 and C07 are never retrieved or cited
    - X01–X03 come back `below-floor` with no model call; `llm_calls` holds exactly 20 `ask.answer` rows
    - the route mix: 15 default, 3 comparative intent, 2 candidate count
    - recall@5 ≥ 1.000, MRR ≥ 0.95, vector-only below hybrid, and the floor splits all 23 correctly
    - `ask.answered` is logged for every question, and no log entry contains a question or an answer
- **recall@5 as of 2026-10-10** (`npm run ask:golden`, ADR 0008):

  | Keyword match | recall@5 | MRR   |
  | ------------- | -------- | ----- |
  | `all`         | 0.983    | 1.000 |
  | `any` (ask)   | 1.000    | 0.950 |
  | `off`         | 0.958    | 0.938 |
  - Vector-only misses C01 in Q14 and C04 in Q19; `any` recovers both.
  - `all` matched anything on only 3 of 20 questions.
  - The set is close to saturated (8 candidates, top 5 chunks), so treat these as a regression gate, not a quality claim.

- **The answers:** 20 answered, 34 verified citations, 0 dropped. Flash-Lite answered 15; Flash answered Q02, Q10, Q19 (comparative intent) and Q11, Q12 (chunks spanning 7 candidates).
- **Similarity floor:** answerable best similarities are ≥ 0.661 (Q14, Q15) and out-of-scope ones ≤ 0.639 (X02), so `SIMILARITY_FLOOR` = 0.65.
- **Live calls this phase, all run by Hamzah:**
  - Stage A, 2026-10-10: 23 query embeddings (`--retrieval-only`).
  - Stage B: 20 answers, which had to be recorded again, because the hybrid SQL's tie order depended on row storage (see Phase 6 changes).
  - The re-recording: 26 live attempts. Flash's free quota of 20 requests per day ran out, so Q10 and Q11 fell back to Flash-Lite; those two fixtures were deleted.
  - The next day, after the quota reset: 3 attempts, for 2 Flash answers.
  - That is 72 live calls against the 43 planned. Ingestion and screening made 0, thanks to record-missing (`seed:record` with a dummy key reported `live 0`).
  - A grep of the 20 answer fixtures found no name, email, phone or profile link.
- **`npm run test:integration` passes:** 89 tests in 6 files (Phase 5: 74 in 5).
  - The seed test still replays every screening fixture after the keyword-match and tie-break changes.
  - A new chunk-repository test rewrites rows to reverse their stored order and checks the results don't move. It fails on the old SQL.
- **`npm run verify` is green:**
  - 1,066 unit tests: contracts 29, api 1,033, web 4. Phase 5 had 901.
  - 0 dependency-cruiser violations (337 modules)
  - every coverage gate passes
- **The route, checked by hand** against the local server in replay mode:
  - Q01 returns three verified citations (C05, C10, C01) from `gemini-3.5-flash-lite`, `routedReason: default`, replayed from the fixture the CLI recorded.
  - X01 returns insufficient evidence with `model: null`.
  - A question with Unicode tag characters gets a 422 `INJECTION_REJECTED` problem.
  - A malformed body gets a 400.
  - The server log's `ask.answered` lines hold ids, counts, similarity and route only.
- **The bundle builds** (`dist/lambda.mjs` 3.1 MB) **and boots:** `npm run smoke:bundle` → 200.
- **Not pushed yet.** CI and deploy aren't part of this phase's DoD. The 12 Phase 6 commits wait for Hamzah's approval, on top of the unpushed Phases 4 and 5.

## Phase 5 evidence (2026-10-09)

Phase 5's DoD is local: every non-quarantined candidate has a scorecard, 100% of citations are valid, and the ranking matches §12.

- **Fixtures recorded live:** Hamzah ran `npm run seed:record` on 2026-10-09.
  - 105 calls: 105 live, 0 fallbacks, 0 failed.
  - New fixtures:
    - 24 `screen.agent` turns: 3 per candidate, so every agent stopped well inside `MAX_AGENT_STEPS`
    - 8 `screen.synthesize` replies
    - 0 `screen.repair` calls: every first draft verified
    - 48 query embeddings
  - The 9 `guard.classify` fixtures were re-recorded under the same keys. C07 is now `malicious` 1.00 (it was 0.99). The `embed.documents` re-recording differed only in `recordedAt`, so it wasn't committed.
  - A grep of the fixtures found no resume name, email, phone or profile link.
- **The ranking matches §12.** The replay table is identical to the recording:

  | #   | Alias | Score | Must-haves | Ratings (S/P/N/U) | Citations |
  | --- | ----- | ----- | ---------- | ----------------- | --------- |
  | 1   | C01   | 100   | 4/4        | 7/0/0/0           | 10        |
  | 2   | C02   | 100   | 4/4        | 7/0/0/0           | 11        |
  | 3   | C10   | 100   | 4/4        | 7/0/0/0           | 12        |
  | 4   | C05   | 69    | 4/4        | 3/4/0/0           | 8         |
  | 5   | C09   | 58    | 2/4        | 4/1/2/0           | 6         |
  | 6   | C03   | 50    | 4/4        | 0/7/0/0           | 13        |
  | 7   | C04   | 50    | 2/4        | 3/1/3/0           | 8         |
  | 8   | C08   | 27    | 2/4        | 0/3/4/0           | 5         |
  | 9   | C06   | –     | –          | quarantined       | –         |
  | 10  | C07   | –     | –          | quarantined       | –         |
  - C01 and C02 are at the top (C10, the strong match with heavy PII, ties them at 100; ties sort by alias).
  - C03 is penalized for claims without evidence: every requirement is `partial`, and nothing is `strong`.
  - C05 (Projects evidence) is mid-high, C04 and C09 are mid, and C08 is low.

- **Implicit caching works on both tiers** (from `llm_calls` of the recording run):
  - `screen.agent` on `gemini-3.5-flash-lite`: 93,166 of 170,447 input tokens cached (55%). Google doesn't document Flash-Lite's minimum, so this answers ADR 0011's open question.
  - `screen.synthesize` on `gemini-3.5-flash`: 18,728 of 44,681 (42%).
  - Synthesis used 32,731 output tokens over 8 calls (about 4,100 each, thinking included), half of `SYNTHESIS_MAX_OUTPUT_TOKENS`.
- **Offline seed on a fresh volume:** `docker compose down --volumes`, `npm run db:up`, `npm run db:migrate` (2 applied), then `npm run seed -- --reset` with `GEMINI_API_KEY` empty:
  - `seed --reset` took 2.1 s, and an idempotent re-run 1.5 s
  - `Model calls: 105 (live 0, fallbacks 0, failed 0)`, and 0 calls on the re-run
- **`npm run test:integration` passes:** 74 tests in 5 files (Phase 4: 62). `test/integration/seed.test.ts` replays the fixtures and asserts:
  - a scorecard for each of the 8 non-quarantined candidates, and none for C06 and C07
  - all 73 citations equal the resume text at their spans, inside the cited chunk, with refs owned by the candidate
  - every strong or partial rating has a citation
  - C01 and C02 rank first, and the quarantined candidates last
  - C03 is below C01, C02 and C05, with nothing strong
  - prompt version `screening@1` and both models are stored
  - a second run screens nobody and calls no model
- **`npm run verify` is green:**
  - 901 unit tests: contracts 21, api 876, web 4. Phase 4 had 705.
  - 0 dependency-cruiser violations (306 modules)
  - every coverage gate passes
- **Routes checked by hand** against the local server in replay mode:
  - `GET /api/jobs` lists the job.
  - `GET /api/jobs/senior-fullstack-ai/candidates` ranks as above, with every `displayName` null.
  - `GET /api/candidates/:id` (C01) returns score 100, and the first citation's span selects exactly its quote.
  - `POST …/shortlist` reveals "Priya Raman".
  - A malformed id gets 400.
  - `POST …/screen` on C06 gets a 409 `CANDIDATE_QUARANTINED` problem.
- **The bundle builds and boots:** `npm run build`, then `npm run smoke:bundle` → 200.
- **Not pushed yet.** CI and deploy aren't part of this phase's DoD. The 12 Phase 5 commits wait for Hamzah's approval to push.

## Phase 4 evidence (2026-10-09)

Phase 4's DoD is local: `npm run db:up && npm run db:migrate && npm run seed` works offline in under 30 s, and the outcomes match §12.

- **Fixtures recorded live:** Hamzah ran `npm run seed:record` on 2026-10-09.
  - 17 calls: 17 live, 0 fallbacks, 0 failed.
  - 9 `guard.classify` fixtures (`gemini-3.5-flash-lite`). C06 never reaches the classifier.
  - 8 `embed.documents` fixtures (`gemini-embedding-2`). C06 and C07 are never embedded.
  - This was the first live batched `embedDocuments` call (ADR 0007); it returned one 768-d vector per chunk.
  - A grep of the fixtures found no email, phone, street, profile link or header name.
- **Offline seed on a fresh volume:** `docker compose down --volumes`, `npm run db:up`, `npm run db:migrate` (2 applied), then `npm run seed` with `GEMINI_API_KEY` empty:
  - `Measure-Command`: `seed --reset` 2.5 s, idempotent re-run 2.0 s
  - `Model calls: 17 (live 0, fallbacks 0, failed 0)`
- **Outcomes match §12 exactly.** The replay table is identical to the recording:

  | Alias | Status      | Signals                                                                                          | Dismissed                 | Classifier     | Chunks |
  | ----- | ----------- | ------------------------------------------------------------------------------------------------ | ------------------------- | -------------- | ------ |
  | C01   | clean       | –                                                                                                | –                         | benign 1.00    | 7      |
  | C02   | clean       | –                                                                                                | `L2.instruction-override` | benign 1.00    | 7      |
  | C03   | clean       | –                                                                                                | –                         | benign 1.00    | 6      |
  | C04   | clean       | –                                                                                                | –                         | benign 1.00    | 6      |
  | C05   | clean       | –                                                                                                | –                         | benign 1.00    | 7      |
  | C06   | quarantined | L1 html-comment, white-text; L2 instruction-override, evaluator-targeting, output-forcing (high) | –                         | skipped        | 0      |
  | C07   | quarantined | L2 evaluator-targeting, output-forcing (medium)                                                  | –                         | malicious 0.99 | 0      |
  | C08   | clean       | –                                                                                                | –                         | benign 1.00    | 7      |
  | C09   | clean       | –                                                                                                | –                         | benign 1.00    | 6      |
  | C10   | clean       | –                                                                                                | `L0.zero-width`           | benign 1.00    | 7      |

  That makes 53 chunks in all, from 12 to 232 estimated tokens, so none needed splitting.

- **`npm run test:integration` passes:** 62 tests in 5 files (Phase 1: 45). `test/integration/seed.test.ts` replays the fixtures through the CLI's own wiring (`createSeeder`) and asserts:
  - every §12 outcome
  - no chunks for quarantined resumes, and every chunk an exact slice of `redacted_resume`
  - C10's PII absent
  - every call logged as `replay`
  - an idempotent re-run (no new rows), and a reset that reproduces the same outcomes
- **`npm run verify` is green:**
  - 705 unit tests: contracts 9, api 692, web 4. Phase 3 had 565.
  - 0 dependency-cruiser violations (249 modules)
  - every coverage gate passes. `domain/chunking` is 100% lines and 96.66% branches; `domain/ingestion` is 100%; `application/ingest` is 98.3% lines and 91.17% branches.
- **The offline dataset test checks the rule-level half of §12 on every unit run:** each resume's exact rule signals, zero PII leaks, the required structure, and chunks that are exact slices under the limit.
- **Not pushed yet.** CI isn't part of this phase's DoD, but the new integration test runs there. The Phase 4 commits wait for Hamzah's approval to push.

## Phase 3 evidence (2026-10-09)

Phase 3 is offline: no live call, no deploy. Its Definition of Done is about tests and coverage.

- **Coverage of `domain/redaction` and `domain/guard` is at least 95%,** enforced by per-folder gates in `apps/api/vitest.config.ts`. The gate fails the run when unmet: checked by raising it to 99%, which produced `ERROR: Coverage for branches (96.59%) does not meet "src/domain/guard/**" threshold (99%)`.

  | Folder              | Lines            | Branches         | Functions    | Statements       |
  | ------------------- | ---------------- | ---------------- | ------------ | ---------------- |
  | `domain/redaction`  | 100% (102/102)   | 100% (33/33)     | 100% (36/36) | 100% (110/110)   |
  | `domain/guard`      | 98.89% (178/180) | 96.60% (142/147) | 100% (51/51) | 98.95% (188/190) |
  | `application/guard` | 100%             | 100%             | 100%         | 100%             |

  The uncovered guard branches are two `assertNever` defaults and two regex-group fallbacks, none of them reachable.

- **Every rule has positive and negative cases** (table tests):
  - **PII detectors** (`redact.test.ts`): every type and format has positives. The hard negatives include year ranges, ISO dates, versions, thousands separators, `rgb()`, framework names, "GitHub Actions", a bare `github.com`, five-digit metrics, a university outside Education, a city and state without a ZIP, a lone "School", and already-redacted text.
  - **L0** (`invisible.test.ts`):
    - positives: `L0.zero-width` (U+200B/C/D, U+2060, U+FEFF), `L0.bidi-control` (both ends of each range), `L0.tag-characters` (U+E0000, U+E007F, a smuggled sentence)
    - negatives: a leading BOM, four ZWJ emoji sequences, accented, CJK and Arabic text, NBSP
  - **L1** (`hidden-markup.test.ts`): 25 positive rows across `html-comment`, `markdown-comment`, `hidden-element`, `zero-font-size`, `zero-opacity` and `white-text`, and 17 hard negatives (white on dark, `background-color: white`, greys, readable sizes, partial opacity, `data-hidden`, `aria-hidden`, Markdown link references, `<` in prose, …).
  - **L2** (`rules.test.ts`): each of `L2.instruction-override`, `role-hijack`, `evaluator-targeting`, `output-forcing` and `delimiter-spoofing` has 5–8 attack rows and 4–5 benign rows.
  - **Policy** (`policy.test.ts`): 12 table rows cover every §9.4 outcome, including the 0.7 boundary (0.7 quarantines, 0.69 flags), `classifier: null`, C02/C10 dismissal, and `shouldRunClassifier`.
- **Eval sets drafted and checked offline:**
  - `pii.jsonl`: 15 snippets, all 7 types, 0 leaks.
  - `injection.jsonl`: 40 items. The rules alone flag 18/20 malicious (5 high) and 4/20 benign (all medium, none high).
- **fast-check found a real bug:** RFC 5322 local parts (`!#x{1}@a.aa`) slipped past the email detector. It's fixed and pinned as a table row.
- **`npm run verify` is green locally:**
  - 565 unit tests: contracts 9, api 552, web 4. Phase 2 had 277.
  - 0 dependency-cruiser violations (218 modules)
  - every coverage gate passes
- **Not pushed yet.** CI isn't part of this phase's DoD. The Phase 3 commits wait for Hamzah's approval to push.

## Phase 2 evidence (2026-10-09)

- **`npm run llm:smoke` succeeded live** (run by Hamzah, 2026-10-09 06:58 UTC). It recorded 3 fixtures and ended with `llm.smoke_passed`:

  | Call                       | Model                   | Attempts | Input tokens | Output tokens           | Latency        |
  | -------------------------- | ----------------------- | -------- | ------------ | ----------------------- | -------------- |
  | structured generate, lite  | `gemini-3.5-flash-lite` | 1        | 43           | 20                      | 1,310 ms       |
  | structured generate, flash | `gemini-3.5-flash`      | 1        | 43           | 288 (thinking included) | 1,959 ms       |
  | query embedding            | `gemini-embedding-2`    | 1        | –            | –                       | 768 dimensions |

- **The fixtures replay offline:** `src/main/cli/llm-smoke.replay.test.ts` (2 tests) runs the same `createSmokeCheck` wiring in replay mode, with model IDs read from `.env.example`. It passes locally and in CI, which has no Gemini key.
- **Decorator and routing tests are green:**
  - routing policy: 25 table-driven cases, including hard negatives ("versatile", "bestseller", "Frank")
  - decorators: 31 (routing, pinned route, fallback, retry, call logging)
  - record/replay: 29
  - Gemini adapters: 39, against fake SDK objects
- **`npm run verify` is green locally:**
  - 277 unit tests: contracts 9, api 264, web 4
  - 0 dependency-cruiser violations (190 modules); `@google/genai` is imported only under `infrastructure/llm/gemini/`
  - the domain ≥ 90% and application ≥ 80% coverage gates pass
- **CI is green:** run [37896854739](https://github.com/Hqasim/hiresignal/actions/runs/37896854739) on `6f59638`. Quality, unit, integration and build all passed, including `sam validate --lint` on the new template.
- **The deploy succeeded:** run [37896932650](https://github.com/Hqasim/hiresignal/actions/runs/37896932650).
  - The variables-and-secrets check now covers `GEMINI_API_KEY`, the three `GEMINI_MODEL_*` and `DAILY_LLM_CALL_CAP`.
  - The Lambda's environment has the names `GEMINI_API_KEY`, `GEMINI_MODEL_LITE`, `GEMINI_MODEL_FLASH`, `GEMINI_EMBEDDING_MODEL` and `DAILY_LLM_CALL_CAP` (checked with `keys(Environment.Variables)`; no values printed).
- **Live:**
  - `GET /api/health` → `200 {"status":"ok","db":"up","llmMode":"live","gitSha":"6f59638…"}`, with `x-request-id`
  - 0 `http.unhandled_error`, `db.pool_error`, `health.db_unreachable` or `llm.call_log_failed` events in the 20 minutes after the deploy
  - one cold start: 573 ms init plus 129 ms for the first request; Phase 1 was 304 ms init (see Known issues)

## Phase 1 evidence (2026-10-08)

- **`npm run verify` is green locally:**
  - 111 unit tests: contracts 9, api 98, web 4
  - 0 dependency-cruiser violations (129 modules)
  - the domain ≥ 90% and application ≥ 80% coverage gates pass
- **`npm run test:integration` passes locally on Postgres 18.6:** 45 tests in 4 files (migrations, job and candidate repositories, hybrid chunk search, scorecard and LLM-call repositories).
- **CI is green:** run [37808250861](https://github.com/Hqasim/hiresignal/actions/runs/37808250861) on `e8fc93d`. Quality, unit, build and the new **integration** job all passed. In the integration job, on the `pgvector/pgvector:pg18` service container:
  - `db:migrate` applied 2 migrations
  - a second run applied 0
  - the integration suite passed 45/45
- **The deploy workflow migrated Neon:** run [37808336510](https://github.com/Hqasim/hiresignal/actions/runs/37808336510) logged `db.migrated applied=2 versions=0001_init,0002_app_role_grants` before `sam deploy`. Its smoke test returned `{"status":"ok","db":"up","llmMode":"live","gitSha":"e8fc93d…"}`.
- **Neon checked directly:**
  - `schema_migrations` holds both versions with checksums
  - all 5 tables exist
  - `hiresignal_app` has select, insert and update on every table, but no delete and no create on `public`
  - the role has no superuser, createrole or createdb flag and belongs to no group role
- **Live:**
  - `GET /api/health` → `200 {"status":"ok","db":"up",…}` with `x-request-id`
  - the web root and a deep link return 200
  - CORS still answers only the Amplify origin
  - Lambda logs show 0 `db.pool_error`, `health.db_unreachable` or `http.unhandled_error` events in the hour after the deploy
  - one cold start: 304 ms init plus 277 ms for the first request, which includes the Neon connection
- **The bundle smoke test proves `pg` runs inside `dist/lambda.mjs`:** with an unreachable `DATABASE_URL`, it reports `db: "down"`.

## Phase 0 evidence (2026-10-08)

- **`npm run verify` is green locally**, after a clean `npm ci` with 0 vulnerabilities:
  - 26 tests: contracts 8, api 15, web 3
  - 0 dependency-cruiser violations (76 modules)
  - API coverage: 91.3% statements, 95.5% lines; the domain ≥ 90% and application ≥ 80% gates pass
- **CI green on GitHub:** run [37769214157](https://github.com/Hqasim/hiresignal/actions/runs/37769214157) on `8f2d6df`; quality, unit and build all passed.
- **The deploy workflow succeeds:** run [37769275642](https://github.com/Hqasim/hiresignal/actions/runs/37769275642) passed every step. The steps were:
  1. OIDC
  2. SAM deploy
  3. API smoke test
  4. web build
  5. Amplify deploy
  6. web and deep-link smoke tests
- **The live API answers correctly:**
  - `GET /api/health` → `200 {"status":"ok","db":"unchecked","llmMode":"live","gitSha":"8f2d6df5bb332a1018b8f4a6747a0a640d20f8ad"}` with `x-request-id`.
  - An unknown route returns a 404 problem+json with `requestId`.
  - CORS allows only `https://main.dcq94s69atcgh.amplifyapp.com`; another origin gets no `Access-Control-Allow-Origin`.
  - Lambda runs `nodejs24.x` on arm64 with 1024 MB and 60 s; the log group keeps 7 days.
- **The live web page shows "API: healthy · Build 8f2d6df · LLM mode live"**, checked in Chrome with no console errors. A deep link (`/candidates/deep-link`) returns 200 through the SPA rewrite.

## Decisions

- [0001 Record architecture decisions](adr/0001-record-architecture-decisions.md)
- [0002 Hexagonal architecture with enforced boundaries](adr/0002-hexagonal-architecture-with-enforced-boundaries.md)
- [0003 npm workspaces and a source-only contracts package](adr/0003-npm-workspaces-and-contracts-package.md)
- [0004 Single Lambda behind a Function URL](adr/0004-single-lambda-behind-a-function-url.md)
- [0005 Neon Postgres + pgvector as the only datastore](adr/0005-neon-postgres-pgvector-only-datastore.md)
- [0006 node-postgres everywhere](adr/0006-node-postgres-everywhere.md)
- [0007 Embedding model, dimensions and normalization](adr/0007-embedding-model-dimensions-and-normalization.md)
- [0008 Hybrid retrieval with RRF](adr/0008-hybrid-retrieval-with-rrf.md)
- [0009 Record/replay LLM adapter](adr/0009-record-replay-llm-adapter.md)
- [0010 Rule-based routing with tier fallback](adr/0010-rule-based-routing-with-tier-fallback.md)
- [0011 Prompt caching via byte-stable prefixes](adr/0011-prompt-caching-via-byte-stable-prefixes.md)
- [0012 Deterministic scoring with verified citations](adr/0012-deterministic-scoring-with-verified-citations.md)
- [0013 Layered injection defense and quarantine policy](adr/0013-layered-injection-defense-and-quarantine-policy.md)
- [0014 One-way redaction with branded types](adr/0014-one-way-redaction-with-branded-types.md)
- [0015 Precomputed results and a daily call cap](adr/0015-precomputed-results-and-a-daily-call-cap.md)
- [0016 Secrets via GitHub Environments → Lambda env vars](adr/0016-secrets-via-github-environments.md)
- [0017 Static SPA on Amplify with CI-driven deploys](adr/0017-static-spa-on-amplify-with-ci-deploys.md)
- [0018 Forward-only SQL migrations, run before the code deploy](adr/0018-forward-only-migrations-before-deploy.md)

- [0019 Section-aware chunking with exact offsets](adr/0019-section-aware-chunking-with-exact-offsets.md)
- [0020 Evidence-gathering agent with a separate synthesis call](adr/0020-evidence-gathering-agent-with-separate-synthesis.md)
- [0021 OpenAPI document assembled from the contracts](adr/0021-openapi-document-from-contracts.md)
- [0022 Resume highlight layers rendered from API spans](adr/0022-resume-highlight-layers-from-api-spans.md)

Phase 8 decisions agreed with Hamzah (2026-10-11) and recorded in SPEC:

- **`MustHaves` gains `strong`** (§10, ADR 0012 update), so C03 reads "4/4 met · 0 strong". `summarizeMustHaves` in `domain/scoring` counts it, and `computeScore` uses the same function. It is derived on read from the ratings stored in `scorecards.result`, so there is no migration and no fixture change.
- **§3 matches the seeded data.** Two candidates are quarantined and none is flagged; C02 and C10 show dismissed signals. The Ask step uses golden Q01, because the old question had no fixture. The suggested questions come from the golden set, and the Phase 9 E2E ask journey can use Q01.
- **§11:** the must-haves column shows met and strong; the citation deep link `?cite=<start>-<end>`.

Phase 8 choices recorded in commit messages and ADRs:

- **Highlighting is a pure segmentation** of the redacted resume at every span and token boundary, rendered as text nodes (ADR 0022). Overlapping injection spans merge into one labelled region. Redaction tokens are found by the `[TYPE_N]` grammar, because the API sends no token spans.
- **`/` and `/ask` redirect to the first job,** so the header hard-codes no slug. v1 has one job.
- **Mutations:** shortlisting writes the response into the cached detail. Re-screening refetches the detail and the ranked lists, so the new score comes from the API. Both invalidate only the ranked lists, not the whole cache.
- **The error boundary sits on a pathless route under the layout,** so a failing page keeps the shell. A thrown message is never shown.
- **One accent** (a muted blue `--primary` and `--ring`). `--muted-foreground` was darkened so it stays legible on the muted banner.
- **Ligatures are off in the resume view,** so `-->` shows as typed.
- **`@testing-library/user-event` 14.6.7** (dev, no install scripts). The shadcn primitives badge, skeleton, table, alert, textarea, separator and collapsible came from the pinned CLI, with no new runtime dependency.
- **The About page links only to docs that exist.** `docs/responsible-ai.md` joins it in Phase 10.

Phase 7 decisions agreed with Hamzah (2026-10-11) and recorded in SPEC:

- **OpenAPI is built, with no new dependency** (cut-list item 1 not used, ADR 0021). The document is assembled from the contracts with `z.toJSONSchema`. Swagger UI 5.33.0 comes from jsDelivr with SRI hashes, under a CSP.
- **The per-tier Flash budget is deferred.** The ops summary now shows Flash fallbacks and rate-limited attempts per model, which is the evidence for deciding it.
- **§7.4:**
  - `PayloadTooLargeError` (413) is added.
  - A retryable `LlmCallError` that escapes the decorators answers 503 `LLM_UNAVAILABLE`, not 500, because the embedder has no fallback tier.
  - 5xx application errors are logged as `http.request_failed`, with their code.
- **§10:** the `OpsSummary` and `LlmCallRow` shapes.
  - The summary covers the cap's UTC day.
  - Tokens, the cache ratio and latency cover live calls only, because a replay reads a fixture in about 0 ms.
- **§17:**
  - The logger drops a denylist of content and secret keys.
  - The access log (`http.request`) records the route pattern, never the raw path.

Phase 7 choices recorded in commit messages and ADRs:

- **The body limit's `onError` throws `PayloadTooLargeError`.** Hono's default throws an `HTTPException`, which the error handler would render as a 500.
- **The access log uses `routePath(c, -1)`** from `hono/route`, because `c.req.routePath` is deprecated. An unmatched URL logs `/*`.
- **The ops contracts are strict objects,** so a content field fails validation. `LlmCallRow.task` and `routedReason` are plain strings, because the contracts package can't import the domain's unions.
- **`/api/openapi.json` is serialized once per process.** `c.json` on the recursive JSON type hit TypeScript's instantiation-depth limit, so the route returns the cached string with `c.body`.
- **The in-memory call repository mirrors `percentile_cont`'s interpolation,** so route tests see the same numbers Postgres returns.

Phase 6 changes agreed with Hamzah (2026-10-09/10) and recorded in SPEC:

- **Record mode records only missing fixtures** (§9.8, ADR 0009 update). A fixture-first split between retry and call logging replays any request that has a fixture, logged as `replay` and not throttled. To force a re-recording, delete that task's fixtures.
- **Two-stage recording, to avoid wasted calls:**
  - `npm run ask:golden -- --mode record --retrieval-only` records only the question embeddings.
  - The retrieval is tuned offline.
  - `npm run seed:record` (which now chains `ask:golden --mode record`) records only the answers.
- **An answer with no verified citation becomes insufficient evidence** (§9.7 step 5). So does one where the model said so.
- **`SIMILARITY_FLOOR` 0.55 → 0.65** and **`ASK_ESCALATION_CANDIDATES` 3 → 6** (Hamzah's choice; at 3 every question escalated). Both are in §7.5, with their evidence in ADR 0008.
- **§12:** `retrieval.jsonl` adds 3 out-of-scope questions, which set the floor.
- **§10:** `AskRequest` is trimmed, 1–500 characters. `AskResponse` citations carry `span`, and `model` and `routedReason` are `null` when the floor answered.
- **§7.2:** `LlmClient` returns `LlmResult` = `LlmResponse` + `routedReason` (ADR 0010 update).
- **§7.5 gains** `ASK_KEYWORD_MATCH` (`any`) and `ASK_MAX_OUTPUT_TOKENS` (4096).
- **§9.7:** ask's keyword arm ORs the question's words; the screening agent keeps AND.

Phase 6 choices recorded in commit messages and ADRs:

- **`HybridSearchQuery.keywordMatch`** (`all` | `any` | `off`): `off` is the vector-only ablation for Phase 9. The screening tools pass `all`, so their results and fixture keys are unchanged.
- **Both search arms break ties by alias, then ordinal.** Without that, tied `ts_rank_cd` values were numbered in physical row order, which differs between a fresh and a re-seeded database. That cost one re-recording of the 20 answers.
- **The question guard** (`domain/guard/scan-question.ts`) runs ingestion's L0 → NFKC → L1 + L2 and rejects only on a high signal, as §9.7 says. There's no classifier call on questions.
- **`verifyCitation` is shared** by screening and ask (`domain/citations/verify-citation.ts`); a `null` alias means any candidate.
- **The ask prompt `ask@1`** has a byte-stable system instruction with no job or candidate data. It is below the implicit-cache minimum, so it isn't cached. Examples use the fictional `X01`, like screening.
- **`createRetrieveForQuestion`** is retrieval on its own, used by the golden report for the per-mode ablation. Retrievals run one after another, so a new question is embedded live only once.
- **Retrieval metrics and the golden report** live in `apps/api/evals/`, ready for Phase 9's runner. `evals/` joins the tsconfig and the unit test project.
- **`readJsonBody`:** an unparseable body is a 400, never a 500.

Phase 5 changes agreed with Hamzah in the plan (2026-10-09) and recorded in SPEC:

- **Strict downgrade** (§9.6, ADR 0012): after the one repair call, any requirement with a remaining citation error becomes `unclear` (`citation_failed`) and keeps only its valid citations. A requirement the model left out is added as `unclear`. If the repair reply never matches the schema, the first draft is downgraded.
- **The daily-cap middleware moved forward from Phase 7** (§10, §20, ADR 0015), so `POST /screen` was capped from the start. The 429 problem carries `retryAfter` (seconds to UTC midnight), with a matching `Retry-After` header.
- **`GET /api/jobs` and `GET /api/jobs/:slug` were built now,** next to the candidate routes (§20 Phase 5 step 6).
- **Ports** (§7.2): `ChunkRepository.listOutline` (refs, sections and headers, never content) and `JobRepository.findById`.
- **Errors** (§7.4): `CandidateQuarantinedError` (409, `AppErrorStatus` gained 409) and `ValidationError` (400, `VALIDATION_FAILED`) are built.
- **§7.5 gains** `AGENT_MAX_OUTPUT_TOKENS` (2048), `SYNTHESIS_MAX_OUTPUT_TOKENS` (8192), `SEARCH_QUERY_MAX_CHARS` (200) and `CACHE_PREFIX_MARGIN` (0.1).
- **§9.2:** one prefix serves the agent, synthesis and repair calls. The rubric adds that a bare Skills or Summary mention is at most `partial`. Resume text is spotlighted as `resume_outline` and `resume_chunk`.

Phase 5 choices recorded in commit messages and ADRs:

- **The worked examples use a fictional rubric (`E1`–`E5`) and candidate `X01`,** so the prefix works for any job and the alias test can forbid `C\d\d`. They make the prefix 5,239 estimated tokens (gate 4,506) with content, not padding.
- **The draft schema uses only `enum` and `maxItems`,** which Gemini documents (checked 2026-10-09); `maxLength` isn't documented. Rationale (300) and summary (400) are capped in code by `capText`, now shared with the classifier.
- **Tool results never include similarity scores,** so the conversation and its fixture keys depend only on which chunks were found.
- **Calls on the agent's last allowed turn still run,** so their chunks join the evidence, but no further turn is sent.
- **Evidence is deduplicated by ref and kept in resume order.** Synthesis runs in a fresh conversation, not the agent history (ADR 0020).
- **`labelWithRef` and the `'\n\n'` separator** are the new derived `RedactedText` constructors (ADR 0014 update).
- **Seeding and screening are separate use cases** (`createSeedJob`, `createScreenPool`), composed by `createSeeder` and the seed runner. The screening tunables live in `main/screening-settings.ts`, shared by the seed and the API.
- **Route input** is validated with the contracts schemas (`parseRequest`). Names are hidden by the mappers until shortlisting. Shortlisting returns the full candidate detail.

Phase 4 changes agreed with Hamzah in the plan (2026-10-09) and recorded in SPEC:

- **Invisible characters in resumes are visible `\u{XXXX}` escapes,** which the dataset loader decodes before ingestion (§12, `data/README.md`). `source_hash` is of the file as stored.
- **`CandidateRepository` gains `findBySourceHash` and `deleteByJob`** (§7.2). Ingestion checks for an existing candidate first, so re-seeding makes no model calls. `--reset` deletes with the owner role.
- **Chunking as built** (§9.5, ADR 0019):
  - a role keeps its `###` line; a section's `##` line moves to the context header
  - the preamble isn't chunked
  - splits fall between bullets or paragraphs
  - one `embedDocuments` call per resume, embedding the header, a line break and the content
- **`SEED_MIN_CALL_INTERVAL_MS` = 6000** (§7.5). Google publishes no free-tier numbers (its rate-limits page points to AI Studio), so it assumes 10 per minute.
- **ADR 0014 update:** the derived constructors `sliceRedactedText` and `joinRedactedText`. `contextHeader` is `RedactedText`.

Phase 4 choices recorded in commit messages and ADRs:

- **`yaml` 2.9.1** (dependency of `@hiresignal/api`, no install scripts), imported only in `infrastructure/dataset/`.
- **`seed:record` always resets,** so a recording covers every resume. Seeding connects as `DATABASE_MIGRATION_URL` (§16).
- **`withThrottle` sits innermost,** above the provider clients, so retries and fallbacks are spaced out too. Only record and live modes use it.
- **`withCallTally` counts fallbacks.** The CLI fails a recording that fell back, because the fixture would be saved under the other tier's model.
- **`main/seed-wiring.ts` is shared** by the CLI and the replay integration test, so both send byte-identical requests.
- **A resume without a `# Name` heading gets its alias as `displayName`.**

Phase 3 changes agreed with Hamzah in the plan (2026-10-09) and recorded in SPEC:

- **The classifier is skipped when a high signal already quarantines** (`shouldRunClassifier`, `classifier: null`). Its answer couldn't change the outcome, and a known attack never reaches a model (§9.4, §9.5, §6.3 flow, ADR 0013).
- **`malicious` below `CLASSIFIER_QUARANTINE_CONFIDENCE` flags.** Read literally, the first draft made it `clean` when no rule fired (§9.4).
- **Redaction:**
  - The summary counts distinct entities.
  - Every name variant shares `[PERSON_1]`.
  - A ZIP is redacted only after `City, ST`.
  - Canonical keys: phone digits, URLs without scheme or `www.` (§9.3, ADR 0014).
- **Detector additions:**
  - L1 also catches `visibility:hidden`, the `hidden` attribute, Markdown `[//]: #` comments, transparent colours, `font-size` ≤ 1px and opacity ≤ 0.05.
  - White text on a declared non-white background isn't flagged.
  - L0 ignores a leading BOM and a ZWJ between two emoji (§9.4).
- **`spotlight()`'s pattern also allows spaces before the slash** (`< /untrusted_…`), and its `<` becomes `&lt;` (§9.2).
- **§7.5 gains `CLASSIFIER_MAX_OUTPUT_TOKENS` = 1024.**

Phase 3 choices recorded in commit messages and ADRs:

- **fast-check 4.10.2** (devDependency of `@hiresignal/api`, no install scripts). Property runs use a fixed seed, so CI stays deterministic.
- **The classifier's response schema has no `maxLength`.** Gemini's structured-output page documents only `enum` and `format` for strings, so the 300-character rationale cap is applied in code (truncation), not by a repair call.
- **`createClassifyInjection` returns the `ClassifierVerdict` only.** Model, tokens and latency are already in `llm_calls`.
- **Signal excerpts:** L0 excerpts name code points and counts only, never a decoded tag payload (raw text isn't redacted yet). L1 and L2 excerpts are capped at 160 characters.
- **Dataset tests live next to the code** (`*-dataset.test.ts`) and read `data/evals/*.jsonl` with `node:fs`. dependency-cruiser's purity rule excludes test files.
- **Invisible characters in tests and data are always escapes,** never literal characters. Use the `\u{…}` form in TypeScript. The JSONL files are written by a script that emits JSON `\u` escapes.

Phase 2 changes agreed with Hamzah (2026-10-08/09) and recorded in SPEC:

- **Embeddings use `gemini-embedding-2`,** not `gemini-embedding-001` (ADR 0007).
  - It takes retrieval prefixes (`task: search result | query: …`, `title: none | text: …`) instead of task types.
  - It needs one `Content` per text; plain strings merge into a single embedding.
  - It normalizes 768-d output itself; we normalize again anyway.
  - SPEC §6.1, §9.5, §9.7, §16, §21 and CLAUDE.md were updated.
- **`npm run llm:smoke` checks both generation tiers** plus one embedding (SPEC §20).
- **Model IDs:** `gemini-3.5-flash-lite` and `gemini-3.5-flash` (Hamzah's choice from Google's stable list on 2026-10-09), in `.env.example` and the `production` variables.
- **§7.2/§7.3 as built** (ADR 0010):
  - Use cases get `LlmClient`. Only `withRouting` produces the `RoutedLlmRequest` that the inner chain requires; this replaces the optional `tier` field.
  - `LlmResponse` gains `finishReason`.
  - Provider failures are `LlmCallError`.
  - `withRetry` honours Gemini's `RetryInfo.retryDelay` (the SDK drops headers, so there is no `Retry-After`) up to `LLM_RETRY_MAX_DELAY_MS`, and longer waits go straight to fallback.
- **§7.5 gains** `LLM_MAX_RETRIES`, `LLM_RETRY_BASE_DELAY_MS`, `LLM_RETRY_MAX_DELAY_MS`, `EMBEDDING_BATCH_SIZE` and `SMOKE_MAX_OUTPUT_TOKENS`.
- **§9.8:** fixtures carry `kind`. Embedding keys include the adapter's input-format version (`GEMINI_EMBEDDING_INPUT_FORMAT`), because the prefixes are applied inside the adapter.
- **`platform.smoke` joins the `LlmTask` union** (routed to lite). `llm_calls.task` is `text`, so no migration was needed.

Phase 2 choices recorded in commit messages and ADRs:

- **`@google/genai` 2.28.0.** Its preinstall (an `echo` no-op) and protobufjs's postinstall (a version warning) are denied in `allowScripts`.
- **The Gemini adapters take the SDK's `models` object as a parameter,** so unit tests use fakes and never touch the network. Text and function calls are read from the parts, because the SDK's `text` getter writes console warnings.
- **`outputTokens` = candidates + thinking tokens:** both are billed and both count toward `maxOutputTokens`. `temperature` is left unset, as Google recommends for Gemini 3.
- **A failed `llm_calls` write is logged (`llm.call_log_failed`) and doesn't fail the model call.**
- **Embeddings get call logging and record/replay, but no retry or fallback:** there's no second embedding tier.
- **The smoke CLI pins each tier (`withPinnedRoute`) and needs no database.** It records fixtures and logs metadata only.
- **Fixtures are pretty-printed JSON with number arrays on one line** (one line per vector), and are excluded from Prettier.
- **The production secret and variables were set by Claude with Hamzah's approval.** The key was piped from `.env` to `gh secret set` through stdin, never printed.

Phase 1 changes agreed with Hamzah (2026-10-08) and recorded in SPEC:

- **The deploy migrates before `sam deploy`** (§15, ADR 0018). Migrations must be additive.
- **Health keeps `db: 'up' | 'down'`.** `'unchecked'` is retired, and the §20 DoD reads `db: up`.
- **Local and CI run `pgvector/pgvector:pg18`,** to match Neon's Postgres 18. The volume mounts `/var/lib/postgresql`, because Postgres 18 images use a versioned PGDATA.
- **§7.2 port methods are as built:**
  - chunks are written only by `CandidateRepository.insertIngested` (one transaction)
  - `getDetail` is composed from `findById` and `ScorecardRepository.latestFor`
  - `LlmTask` and `ModelTier` live in `domain/routing/`

Phase 1 choices recorded in commit messages and ADRs:

- **`pg` 8.23.1, with no install scripts.** The pool sets a 10 s connect timeout (Neon cold start), a 15 s client-side query timeout instead of a `statement_timeout` startup parameter (pooler-safe), channel binding, and a pool `error` listener.
- **Connection strings use `sslmode=verify-full`.** node-postgres treats `require` as an alias and warns about it.
- **JSONB schemas for the guard verdict, scorecard result and agent trace are defined from §9.4 and §9.6.** Phases 3 and 5 may refine them; that needs only a Zod change, no migration.
- **`rehydrateRedactedText()` is the one documented way to re-brand stored text as `RedactedText`.** Only the Postgres row mappers call it.

Phase 0 choices recorded in commit messages rather than ADRs, because they're dependency or sequencing choices, not architecture:

- TypeScript 6.0.3, not 7.x: typescript-eslint supports only TS < 6.1.
- ESLint 10, with an `overrides` entry so jsx-a11y 6.10.2 accepts it. A probe file confirmed the a11y rules fire.
- `shell-quote` is overridden to 1.12.0 (GHSA-pqg4-j6r4-53mv, via concurrently).
- The Lambda adapter is `@hono/aws-lambda`; `hono/aws-lambda` is deprecated.
- The shadcn CLI isn't a dependency (it carried high-severity advisories). Its `tailwind.css` is vendored from 4.21.4.
- npm 11 install-script approval: lefthook and esbuild postinstalls are denied in `allowScripts`. Neither is needed.
- The deploy role trusts GitHub's immutable OIDC subject (`owner@id/repo@id`).
- SPEC 1.4: the deploy workflow and package scripts grow phase by phase.

## Deferred and cut-list items

- **Measuring a live `POST /screen` on Lambda:** it hasn't run in production yet. The recording logs latencies that include the 6 s seed throttle, so they aren't model latencies. Measure after the next deploy (see Known issues).
- **Seeding production** (`seed-demo` workflow, replay with `--reset` against Neon): Phase 10.
- **Classifier precision and recall, and the rules-only vs rules + classifier ablation:** the Phase 9 eval runner, over `data/evals/injection.jsonl`.
- **A smaller cold start:** load `@google/genai` lazily on the first live call, if the cold start matters (see Known issues).
- **Playwright `@smoke` step in `deploy.yml`:** Phase 9, because Playwright isn't installed yet. `curl --fail` smoke tests cover the API and web until then.
- **An index-friendly vector arm** (`ORDER BY embedding <=> $1`, `hnsw.iterative_scan`, `job_id` on chunks): only at scale (ADR 0008). It would need a re-recording of the screening fixtures.
- **A per-tier daily budget** (deferred on 2026-10-11): skip Flash once its free quota (20 requests per day) is spent, instead of failing over after each 503 or 429. The ops summary's per-model errors and fallbacks show whether it's needed. See Known issues.
- **A request id on embedding rows** (see Known issues).
- **Retrieval ablation and recall gates in the eval runner:** Phase 9 reuses `evals/retrieval-metrics.ts` and `evals/golden-report.ts`.
- **A retry on stale connections in the health probe:** only if Lambda logs ever show `health.db_unreachable` after a thaw (ADR 0006).
- **Scripts arriving with their phases:**
  - `eval` and `test:e2e` (Phase 9)
- **`ValidationError` and the other `AppError` subclasses:** added by the phases that raise them (SPEC §7.4).
- **axe checks and the Playwright tour:** Phase 9. The headless-Chrome script used for the Phase 8 DoD lives outside the repo; Playwright replaces it.
- **Dark mode** (a Could): the tokens exist under `.dark`, but nothing toggles them, and the amber, red and emerald highlight classes have no dark variants.
- **The About page links `docs/responsible-ai.md`** once Phase 10 writes it.
- **No cut-list items used.** The re-run button and trace timeline (item 3) and the full ops page (item 4) were both built.

## Known issues

- **Embedding rows in `llm_calls` have no request id.** The `Embedder` port takes no `requestId`, so `withEmbeddingCallLogging` stores `null`, even for an ask's question embedding. As a result, the ops page can't tie an `embed.query` row to its request. The fix is to thread `requestId` through `embedQuery`; that changes no fixture key.
- **The OpenAPI `OPERATIONS` table lists each route's error statuses by hand.** Tests catch a missing or extra route, but not a status that a route gained without the table being updated (ADR 0021).
- **In replay mode, ask answers only the 23 golden questions.** Any other question gets 500 `FIXTURE_MISSING`, whose detail names `npm run seed:record`. Production runs live, so this affects only local and E2E use. The Ask page suggests golden questions only, and the Phase 9 E2E ask journey can use Q01, which is recorded.

- **Gemini Flash's free tier allows 20 requests per day** (seen in AI Studio, 2026-10-10), far below `DAILY_LLM_CALL_CAP` (300).
  - A live re-screen spends 1–2 Flash calls, and 5 of the 20 golden questions escalate to Flash.
  - Once the quota is spent, Flash calls fail (503s and timeouts were logged) and fall back to Flash-Lite. The demo keeps working at lower quality, but every failed attempt also counts against the daily cap.
  - Recording is affected too: a full screening re-record needs at least 8 Flash calls, so plan recordings around the daily reset (midnight Pacific).
- **The similarity floor's margin is narrow:** 0.022 on each side of 0.65 (ADR 0008). It's a cost guard. A new kind of question can land on the wrong side, and then the model's insufficient-evidence flag and citation verification decide.
- **Q10 matches comparative intent by accident** ("reciprocal **rank** fusion" contains `rank`), so it routes to Flash. This is harmless, and it's pinned by the ask integration test's route mix.
- **The golden set is close to saturated** (recall@5 = 1.000 with 8 candidates). Add harder questions before reading it as a quality claim (Phase 9).

- **Regex detectors have documented gaps** (`docs/threat-model.md`, Known limits):
  - names outside the header, non-US addresses
  - cross-script homoglyphs, external CSS, nested same-name tags
  - paraphrased social engineering, which only L3 catches
- **C07 is quarantined only by the classifier** (`malicious` 0.99 on 2026-10-09); the rules alone would flag it. Changing the classifier prompt or model means re-recording, and the seed integration test catches a changed verdict.
- **C01, C02 and C10 tie at 100,** so their order is by alias. The DoD holds (C01 and C02 first), but it rests on the tie-break.
- **A live re-screen may approach the Lambda's 60 s timeout.** A screening is about 3 Flash-Lite agent turns, their query embeddings and one Flash synthesis that writes about 4,000 output tokens, thinking included. Measure it after a deploy. If it's too slow, cap the agent turns for live runs, or answer 202 and screen in the background.
- **Changing any screening prompt** (a new `SCREENING_PROMPT_VERSION`) changes every screening fixture key: clear `screen.*` and run `npm run seed:record` (`docs/runbook.md`).
- **Editing a resume or the classifier prompt changes fixture keys.** Clear `guard.classify` and `embed.documents`, then re-record (`docs/runbook.md`, Re-record fixtures).
- **Windows Python writes CRLF.** One-off edit scripts must write LF, or `format:check` fails. Prefer Node or the editor tools.
- **The Gemini SDK made the bundle and cold start heavier.**
  - The bundle grew from 988 kB to 2.7 MB with `@google/genai` and its dependencies (google-auth-library, protobufjs, ws).
  - As of 2026-10-09, Lambda init is 573 ms (Phase 1: 304 ms). The web app's health call on page load absorbs it.
  - If it matters, the fix is a dynamic `import()` of the SDK on the first live call.
- **Gemini 3 Flash spends output tokens on thinking:** 288 output tokens for a 20-token reply in the smoke check. Later phases must budget `maxOutputTokens` with this headroom.
- **`npm run dev` now needs the three `GEMINI_MODEL_*` variables in `.env`.** Copy them from `.env.example`. Replay mode needs no key.

- **Dependabot npm updates may fail for a few days.** Its default cooldown hides versions published in the last 3 days, and our exact pins (for example typescript-eslint 8.71.1) are newer than that. The error is `ETARGET … with a date before …`. It clears by itself.
- **Dependabot PR #1 (`@types/node` 24 → 26) should be closed.** `dependabot.yml` now ignores `@types/node` majors, because the types must follow the Node 24 runtime.
- **The `ubuntu-latest` runner label moves to Ubuntu 26 on 2026-10-19 (GitHub notice).** Watch the first CI run after that date.
- **The web shell chunk is 373 kB (119 kB gzip)** as of 2026-10-12, and the contracts with Zod a shared 102 kB (30 kB gzip). Pages are 5–29 kB each. Measure again if a page grows; Zod is the first thing to look at.
- **The API's overall unit-coverage figure fell to about 43%** because the Postgres adapters run only in integration tests, which don't collect coverage. Only the domain and application gates are enforced, and they pass. Don't read the "All files" line as a regression.
- **A machine that ran the Postgres 17 container needs a one-time reset:** `docker compose down --volumes; npm run db:up; npm run db:migrate`. Postgres 18 can't open a 17 data directory.

## Session handoff

**2026-10-08, Phase 0 done.** The monorepo, quality gates, API, web app, infrastructure, CI/CD and docs are in place. Production was deployed from CI with keyless OIDC. Two first-deploy problems were found and fixed:

- **Empty environment variables:** a Windows PowerShell 5.1 `ConvertFrom-Json` pipeline quirk in the runbook left three of them empty.
- **OIDC denied:** the repository uses GitHub's immutable subject claim, which the trust policy didn't match.

The runbook and `bootstrap.yaml` are corrected.

**2026-10-08, Phase 1 done.** The persistence layer is complete and live:

- forward-only migrations, with a checksum-guarded runner that the deploy runs before `sam deploy`
- branded domain types and Zod schemas for every persisted value
- five repositories behind application ports, including hybrid search (vector + full text, RRF) with cosine similarity
- a health route that pings Neon
- an integration CI job on Postgres 18 + pgvector

Claude configured Neon with the Neon CLI, with Hamzah's approval:

- created `hiresignal_app` with SQL
- built both connection strings with `sslmode=verify-full`, tested them, and stored them as `production` secrets through stdin, so no value was printed

Local and CI moved to Postgres 18 to match Neon.

**2026-10-09, Phase 2 done.** The LLM platform is complete and live:

- `LlmClient` and `Embedder` ports
- Gemini adapters
- the routing → fallback → retry → call-logging chain
- record/replay keyed by request hash
- AI tunables
- a smoke CLI

The first live smoke passed on `gemini-3.5-flash-lite`, `gemini-3.5-flash` and `gemini-embedding-2`, and its fixtures replay in CI. Production now runs with the Gemini key and model IDs. No route calls a model yet.

**2026-10-09, Phase 3 done.** The safety layer is complete, offline and unit-tested:

- one-way PII redaction producing `RedactedText` (table, property and dataset tests)
- the L0 invisible-character scan, L1 hidden-markup detection and L2 pattern rules
- the pure quarantine policy
- `spotlight()`
- the L3 classifier use case with a byte-stable prompt
- draft PII and injection eval sets
- ADRs 0013 and 0014, a first threat model, and the safety-layer architecture section

Nothing calls the guard yet; Phase 4's ingest does. No live call and no deploy were needed. The commits are local, waiting for Hamzah's approval to push.

**2026-10-09, Phase 4 done.** Synthetic data and ingestion are complete and run offline:

- the job and ten resumes (§12), with the dataset loader
- `prepareResume` (the rule half of ingestion)
- section-aware chunking with exact offsets (ADR 0019)
- the ingest and seed use cases
- the seed CLI (replay, record, live, `--reset`), throttled and tallied
- recorded classifier and embedding fixtures
- a replay integration test that pins every §12 guard outcome

Hamzah recorded the fixtures live (17 calls, 0 fallbacks). A replay seed takes 2.5 s. No deploy was needed. The 11 commits are local, waiting for Hamzah's approval to push.

**2026-10-09, Phase 5 done.** Screening is complete and replays offline:

- the byte-stable screening prefix (ADR 0011)
- a candidate-scoped, read-only agent with `search_resume` and `read_section`, then synthesis in a fresh conversation (ADR 0020)
- citation verification with exact spans, one repair call, strict downgrade, and the score computed in code (ADR 0012)
- seeding that precomputes scorecards, and the daily cap (ADR 0015)
- job and candidate routes with contracts

Hamzah recorded the screening fixtures live (105 calls, 0 fallbacks, 0 repairs). The ranking matches §12, all 73 citations verify, and implicit caching hit 55% on Flash-Lite and 42% on Flash. No deploy was needed. The 12 commits are local, waiting for Hamzah's approval to push. Phases 4 and 5 are both unpushed, so the first CI run will cover both.

**2026-10-10, Phase 6 done.** Ask the talent pool is complete and replays offline:

- `POST /api/jobs/:slug/ask`, behind the daily cap
- the question guard (a 422 on a high signal)
- hybrid retrieval with OR matching for questions and deterministic tie-breaks
- a tuned similarity floor (0.65): out-of-scope questions make no model call
- routing with `routedReason` in the response
- verified citations mapped to candidates and spans; an answer without one is withheld
- 23 golden questions with `npm run ask:golden`, and ADR 0008

Record mode now records only missing fixtures, so ingestion and screening were never re-recorded. Hamzah recorded 23 embeddings and 20 answers. One extra round of 20 was needed after the tie-order bug, and two Flash answers waited a day for Flash's 20-per-day free quota. recall@5 = 1.000 and MRR = 0.950. The 12 commits are local, waiting for Hamzah's approval to push. Phases 4, 5 and 6 are all unpushed, so the first CI run will cover all three, including the new ask integration test.

Phases 4–6 were pushed afterwards. CI run [38050841071](https://github.com/Hqasim/hiresignal/actions/runs/38050841071) and deploy run [38050883419](https://github.com/Hqasim/hiresignal/actions/runs/38050883419) on `7966270` both passed.

**2026-10-11, Phase 7 done.** The API is hardened, and the ops endpoints are built:

- typed error mapping: `PayloadTooLargeError` (413), and a retryable `LlmCallError` becomes 503 `LLM_UNAVAILABLE`
- the 16 KB body limit, also checked inside the Lambda bundle
- an `http.request` access log, and a logger that drops content and secret keys
- `GET /api/ops/summary` and `/api/ops/calls`, with the aggregates computed in SQL
- the OpenAPI 3.1 document and the Swagger UI page (ADR 0021)
- a contract-coverage test that ties every registered route to contract cases and checks every problem's shape
- curl examples and a quota runbook

No live call and no deploy were needed. The 9 commits are local, waiting for Hamzah's approval to push.

**2026-10-12, Phase 8 done.** The SPA is built against the contracts:

- the app shell: skip link, navigation, synthetic-data banner, the footer health line, an error boundary that keeps the shell
- the jobs page: the ranked table with "met · strong" must-haves (a new contract field) and a quarantined section
- the candidate page: the redacted resume with citation, injection and token layers (ADR 0022), citation scroll-and-focus, `?cite=` deep links, the guard panel, the scorecard, shortlist, re-run and the agent trace
- Ask with golden suggestions and cited answers, Ops, About
- loading, empty, error and quota states everywhere; 360 px wide without page scroll

A headless-Chrome walk through the §3 tour found three issues (a router warning, a favicon 404, overflow at 360 px), which were fixed; the final run logged 0 errors and 0 warnings. No live call and no deploy were needed. The 14 commits are local, waiting for Hamzah's approval to push, on top of the unpushed Phase 7.

**Suggested prompt for the next session:** `/clear`, then `/phase 9` (Evals, E2E and CI hardening):

- the eval runner with the four suites and the ablations, thresholds, `docs/evals.md`
- Playwright journeys from §14 with axe, a `@smoke` subset, and the deploy step that runs it
- the CI `evals` and `e2e` jobs, and the branch-protection runbook

Things to plan for:

- The E2E ask journey can use golden Q01; locally any other question is `FIXTURE_MISSING`.
- Shortlisting persists, so E2E needs a fresh `seed -- --reset` or a candidate it doesn't shortlist elsewhere.
- Phases 7 and 8 are unpushed; the first CI run covers both.
