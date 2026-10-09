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
| 5   | Screening agent and scorecards              | ☐ Not started |            |                                                                                  |
| 6   | Ask the talent pool (hybrid RAG)            | ☐ Not started |            |                                                                                  |
| 7   | API hardening and ops endpoints             | ☐ Not started |            |                                                                                  |
| 8   | Frontend                                    | ☐ Not started |            |                                                                                  |
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
- [0009 Record/replay LLM adapter](adr/0009-record-replay-llm-adapter.md)
- [0010 Rule-based routing with tier fallback](adr/0010-rule-based-routing-with-tier-fallback.md)
- [0013 Layered injection defense and quarantine policy](adr/0013-layered-injection-defense-and-quarantine-policy.md)
- [0014 One-way redaction with branded types](adr/0014-one-way-redaction-with-branded-types.md)
- [0016 Secrets via GitHub Environments → Lambda env vars](adr/0016-secrets-via-github-environments.md)
- [0017 Static SPA on Amplify with CI-driven deploys](adr/0017-static-spa-on-amplify-with-ci-deploys.md)
- [0018 Forward-only SQL migrations, run before the code deploy](adr/0018-forward-only-migrations-before-deploy.md)

- [0019 Section-aware chunking with exact offsets](adr/0019-section-aware-chunking-with-exact-offsets.md)

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

- **Seed fixtures for screening, synthesis and ask:** Phases 5 and 6 extend `seed:record`. The classifier and document-embedding fixtures are recorded (Phase 4).
- **Seeding production** (`seed-demo` workflow, replay with `--reset` against Neon): Phase 10.
- **The question guard for Ask** (L0–L2 on the question, `InjectionRejectedError`): Phase 6. Spotlight labels for questions and chunks arrive with their prompts (Phases 5–6).
- **Classifier precision and recall, and the rules-only vs rules + classifier ablation:** the Phase 9 eval runner, over `data/evals/injection.jsonl`.
- **Enforcing `DAILY_LLM_CALL_CAP`:** Phase 7. The variable and the `countLiveSince` query exist now.
- **A smaller cold start:** load `@google/genai` lazily on the first live call, if the cold start matters (see Known issues).
- **Playwright `@smoke` step in `deploy.yml`:** Phase 9, because Playwright isn't installed yet. `curl --fail` smoke tests cover the API and web until then.
- **`LlmCallRepository.summary` and `recent`:** Phase 7, with the ops DTOs they return.
- **`EXPLAIN` output for hybrid search and notes on `hnsw.iterative_scan`:** ADR 0008 in Phase 6, once real data is seeded.
- **A retry on stale connections in the health probe:** only if Lambda logs ever show `health.db_unreachable` after a thaw (ADR 0006).
- **Scripts arriving with their phases:**
  - `eval` and `test:e2e` (Phase 9)
- **`ValidationError` and the other `AppError` subclasses:** added by the phases that raise them (SPEC §7.4).
- **No cut-list items used.**

## Known issues

- **Regex detectors have documented gaps** (`docs/threat-model.md`, Known limits):
  - names outside the header, non-US addresses
  - cross-script homoglyphs, external CSS, nested same-name tags
  - paraphrased social engineering, which only L3 catches
- **C07 is quarantined only by the classifier** (`malicious` 0.99 on 2026-10-09); the rules alone would flag it. Changing the classifier prompt or model means re-recording, and the seed integration test catches a changed verdict.
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
- **The web home-page chunk is 123 kB (39 kB gzip)**, mostly Zod via the contracts package. Revisit in Phase 8 if route chunks grow.
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

**Suggested prompt for the next session:** `/clear`, then `/phase 5` (screening agent and scorecards). Phase 5 builds:

- the screening prefix
- the agent loop with `search_resume` and `read_section`
- citation verification and deterministic scoring

It also extends seeding to precompute scorecards. Hamzah runs `npm run seed:record` again to record the screening fixtures.
