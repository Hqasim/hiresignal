# Progress log

Claude Code maintains this file. It's updated at the end of every phase and read at the start of every session.

## Phases

| #   | Phase                                       | Status        | Date       | Notes                                                                            |
| --- | ------------------------------------------- | ------------- | ---------- | -------------------------------------------------------------------------------- |
| 0   | Foundations and walking skeleton            | ☑ Done        | 2026-10-08 | CI and deploy green; the live web page shows "API: healthy" from the live Lambda |
| 1   | Database and persistence                    | ☐ Not started |            |                                                                                  |
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
- [0016 Secrets via GitHub Environments → Lambda env vars](adr/0016-secrets-via-github-environments.md)
- [0017 Static SPA on Amplify with CI-driven deploys](adr/0017-static-spa-on-amplify-with-ci-deploys.md)

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

- **Database migrations in `deploy.yml`, plus the `DATABASE_URL` and `DATABASE_MIGRATION_URL` secrets:** Phase 1 (SPEC §20), because migrations don't exist yet.
- **`GEMINI_API_KEY` secret, model-ID variables and the SAM parameters:** Phase 2 (SPEC §20).
- **Playwright `@smoke` step in `deploy.yml`:** Phase 9, because Playwright isn't installed yet. `curl --fail` smoke tests cover Phase 0.
- **Scripts arriving with their phases:**
  - `db:migrate` (Phase 1)
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
- **The Health route reports `db: "unchecked"`.** Phase 1 replaces it with a real ping.

## Session handoff

**2026-10-08, Phase 0 done.** The monorepo, quality gates, API, web app, infrastructure, CI/CD and docs are in place. Production was deployed from CI with keyless OIDC. Two first-deploy problems were found and fixed:

- **Empty environment variables:** a Windows PowerShell 5.1 `ConvertFrom-Json` pipeline quirk in the runbook left three of them empty.
- **OIDC denied:** the repository uses GitHub's immutable subject claim, which the trust policy didn't match.

The runbook and `bootstrap.yaml` are corrected.

**Suggested prompt for the next session:** `/clear`, then `/phase 1`. Before starting, have ready:

- a Neon project in AWS `us-east-1`
- the `hiresignal_app` role created **before** the first migration
- both connection strings: pooled for the app role, direct for the owner
