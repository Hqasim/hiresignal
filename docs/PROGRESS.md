# Progress log

Claude Code maintains this file. It's updated at the end of every phase and read at the start of every session.

## Phases

| #   | Phase                                       | Status        | Date       | Notes                                                                            |
| --- | ------------------------------------------- | ------------- | ---------- | -------------------------------------------------------------------------------- |
| 0   | Foundations and walking skeleton            | ☑ Done        | 2026-10-08 | CI and deploy green; the live web page shows "API: healthy" from the live Lambda |
| 1   | Database and persistence                    | ☑ Done        | 2026-10-08 | Neon migrated by the deploy workflow; live health reports `db: up`               |
| 2   | LLM platform                                | ☐ Not started |            |                                                                                  |
| 3   | Safety layer: redaction and injection guard | ☐ Not started |            |                                                                                  |
| 4   | Synthetic data and ingestion                | ☐ Not started |            |                                                                                  |
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
- [0016 Secrets via GitHub Environments → Lambda env vars](adr/0016-secrets-via-github-environments.md)
- [0017 Static SPA on Amplify with CI-driven deploys](adr/0017-static-spa-on-amplify-with-ci-deploys.md)
- [0018 Forward-only SQL migrations, run before the code deploy](adr/0018-forward-only-migrations-before-deploy.md)

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

- **`GEMINI_API_KEY` secret, model-ID variables and the SAM parameters:** Phase 2 (SPEC §20).
- **Playwright `@smoke` step in `deploy.yml`:** Phase 9, because Playwright isn't installed yet. `curl --fail` smoke tests cover the API and web until then.
- **`LlmCallRepository.summary` and `recent`:** Phase 7, with the ops DTOs they return.
- **`EXPLAIN` output for hybrid search and notes on `hnsw.iterative_scan`:** ADR 0008 in Phase 6, once real data is seeded.
- **A retry on stale connections in the health probe:** only if Lambda logs ever show `health.db_unreachable` after a thaw (ADR 0006).
- **Scripts arriving with their phases:**
  - `llm:smoke` (Phase 2)
  - `seed` and `seed:record` (Phase 4)
  - `eval` and `test:e2e` (Phase 9)
- **`ValidationError` and the other `AppError` subclasses:** added by the phases that raise them (SPEC §7.4).
- **No cut-list items used.**

## Known issues

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

**Suggested prompt for the next session:** `/clear`, then `/phase 2`. Before starting, have ready:

- a Gemini API key from Google AI Studio (free tier)
- the current free-tier model IDs for Flash-Lite, Flash and `gemini-embedding-001`; Phase 2 reads them from `GEMINI_MODEL_LITE`, `GEMINI_MODEL_FLASH` and `GEMINI_EMBEDDING_MODEL`

Phase 2 ends with you running `npm run llm:smoke` once against the live API.
