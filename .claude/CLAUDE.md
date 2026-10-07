# HireSignal: instructions for Claude Code

HireSignal is a blind, injection-aware candidate screening app. It does four things:

- redacts PII before any model sees a resume
- quarantines resumes that carry hidden instructions for AI screeners
- scores candidates with an evidence-gathering agent whose every claim cites a quote that code verifies
- answers questions across the talent pool with hybrid RAG

This is a portfolio project. **The code, tests and docs are the product.** Recruiters, hiring managers, senior engineers and architects will read them, so optimize for clarity, correctness and well-explained decisions.

- **Specification:** `docs/SPEC.md` is the source of truth. Read the relevant sections before every phase.
- **Progress and handoff:** `docs/PROGRESS.md`. Read it at the start of every session; update it at the end of every phase.
- **Detailed standards:** these load from `.claude/rules/` when you touch matching files (backend, frontend, testing, infra/CI, docs).
- **Phase workflow:** `/phase <n>`. New ADR: `/adr <title>`.

## Non-negotiables

1. **Spec first.** If a request conflicts with `docs/SPEC.md`, or the spec looks wrong, stop and ask. When we change direction, update the spec and add an ADR in the same commit.
2. **No live LLM calls in tests or CI.**
   - Tests use hand-written fakes or the replay adapter (`LLM_MODE=replay`).
   - Only `npm run seed:record` and `npm run llm:smoke` touch the live Gemini API, and only when I run them.
3. **PII never reaches a model.**
   - Resume text reaches the embedder (`embedDocuments`), the classifier and every prompt builder only as `RedactedText`.
   - Never widen these types to `string`.
   - Recruiter questions and agent search queries aren't resume text. They go through `embedQuery` and are spotlighted as untrusted input.
4. **Nothing sensitive in logs.**
   - Never log resume text, prompts, model output, user questions or secrets.
   - Log ids, counts, hashes, durations and token usage.
5. **No secrets in git.** Only `.env.example` is committed.
6. **Type safety.**
   - No `any`, no `@ts-ignore`, no non-null `!`.
   - `@ts-expect-error` is allowed only in tests, with a reason.
   - `eslint-disable` needs a same-line justification.
7. **Boundaries are enforced.** Follow the layer rules below; `npm run depcruise` must pass.
8. **$0 infrastructure.** Add no AWS resource, SaaS or paid tier beyond SPEC §16 without asking me.
9. **Don't guess external APIs.**
   - Before writing integration code, check the official docs. This covers `@google/genai`, Hono, AWS SAM, Amplify, Neon, pgvector, Vite, TanStack Query, shadcn/ui and Playwright.
   - Pin exact dependency versions.

## Workflow for every phase

1. Read `docs/PROGRESS.md`, then the phase in SPEC §20 and every section it references.
2. Present a plan, then wait for my approval. The plan covers:
   - ordered steps, each with the files it touches and the tests that prove it
   - which decisions need an ADR
   - anything I must do by hand
   - risks and open questions
3. Build in small vertical steps. For pure logic in `domain/`, write the failing test first.
4. After each step, run `npm run verify` and fix everything before continuing.
5. Commit each logical step with Conventional Commits, for example:
   - `feat(api): add hybrid retrieval`
   - `test(domain): cover redaction edge cases`
   - `docs(adr): 0008 hybrid retrieval`

   Every commit must build. Don't push until I approve. When a Definition of Done item needs CI or a deploy (Phases 0, 1, 9, 10), ask me to approve a push, then check the run with `gh run watch`.
   Once branch protection is on (Phase 9), work on a branch and open a PR instead of committing to `main`.
6. Document as you build:
   - TSDoc on exported symbols
   - the folder README when its responsibilities change
   - an ADR for every non-obvious decision
   - Mermaid diagrams in `docs/architecture.md` when the structure changes
7. Finish the phase:
   - Prove each Definition of Done item with evidence (command output, test counts, URLs).
   - Update `docs/PROGRESS.md`.
   - Summarize what changed, how I can verify it by hand, and what was deferred.
   - Then stop.

## Commands

| Command | Purpose |
|---|---|
| `npm ci` | Install the workspace exactly from `package-lock.json` (Node 24.21.0 from `.nvmrc`, npm 11.19.0+). Add a dependency with `npm install <pkg> -w <workspace>`. |
| `npm run db:up` / `npm run db:down` | Start or stop local Postgres + pgvector (Docker, `localhost:5433`) |
| `npm run db:migrate` | Apply `db/migrations/*.sql` using `DATABASE_MIGRATION_URL` |
| `npm run seed` | Load synthetic data and precomputed results from fixtures (replay, offline) |
| `npm run seed:record` | Run the pipeline against live Gemini and record fixtures (I run this) |
| `npm run llm:smoke` | One live structured call and one embedding to check key and model IDs (I run this) |
| `npm run dev` | API on `:3000` and web on `:5173` (Vite proxies `/api`) |
| `npm run verify` | Format check, lint, typecheck, depcruise, unit tests. Run after every step. |
| `npm run test:integration` | Integration tests against local Postgres (needs `npm run db:up`) |
| `npm run test:e2e` | Playwright against the local stack in replay mode |
| `npm run eval` | Eval suites with thresholds; `npm run eval -- --write` updates `docs/evals.md` |
| `npm run build` | esbuild API bundle (`apps/api/dist/lambda.mjs`) and Vite web build |

Phase 0 creates these scripts. Keep this table accurate if any of them change.

npm passes arguments to a script only after `--`, for example `npm run eval -- --write` or `npm run seed -- --reset`. Without the `--`, npm silently drops the flag.

## Architecture

The repo is an npm-workspaces monorepo (`"workspaces"` in the root `package.json`):

| Path | What it holds |
|---|---|
| `apps/api` | Hono API on AWS Lambda (Function URL); hexagonal architecture |
| `apps/web` | Vite + React + TypeScript SPA on AWS Amplify Hosting |
| `packages/contracts` | Zod schemas and types for every HTTP request and response. The **only** code shared by api and web. |
| `data/` | Synthetic job, resumes and eval sets |
| `db/migrations/` | Plain SQL migrations |
| `infra/` | SAM templates |
| `e2e/` | Playwright tests |
| `docs/` | Spec, progress log, ADRs, architecture |

Layers in `apps/api/src`:

| Layer | Responsibility | May import |
|---|---|---|
| `domain/` | Pure rules: entities, branded types, redaction, guard rules and policy, chunking, routing policy, scoring, citation checks, vector math | `domain/` and `zod` only |
| `application/` | Use cases, ports (interfaces), prompt builders, LLM output schemas | `domain/` and `zod` |
| `infrastructure/` | Adapters: Gemini, LLM decorators, record/replay, Postgres, logger, clock | `application/`, `domain/`, SDKs |
| `interfaces/http/` | Hono routes, middleware, DTO mappers, problem+json | `application/`, `domain/`, `@hiresignal/contracts` |
| `config/` | Env parsing and AI tunables | `zod` only |
| `main/` | Composition root (`container.ts`) and entry points (lambda, local server, CLIs) | Everything |

- SDKs (`@google/genai`, `pg`) are imported **only** in `infrastructure/`.
- Use cases get their ports as factory-function parameters. There's no DI container and no module-level singletons outside `main/`.
- Every LLM call goes through `LlmClient` with a task name. The routing decorator picks the model, so a use case never names one.

## Code standards (summary)

- TypeScript `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Named exports only. kebab-case file names.
- Validate with Zod at every boundary: env, HTTP in and out, LLM output, JSONB read from the DB, CLI args.
- Encode the domain in types: branded IDs and texts, string-literal unions with exhaustive switches. Make illegal states unrepresentable.
- Keep functions small and single-purpose; prefer pure functions with no hidden I/O. Name things in domain language.
- Errors are typed `AppError` subclasses with a stable `code`. They're mapped to RFC 9457 problem+json in one place. Never swallow errors.
- No magic numbers. Tunables live in `config/ai.ts`, each with a TSDoc comment explaining the value.
- Comments explain *why*. Every exported function, type and port has TSDoc, and every layer folder has a short README.md.

## Testing (summary)

- **Levels:**
  - unit tests with Vitest and in-memory fakes
  - integration tests on real Postgres + pgvector
  - route contract tests via `app.request()`
  - component tests with React Testing Library + MSW
  - Playwright E2E with axe
  - evals as CI gates
- **Coverage gates:** `domain/` ≥ 90%, `application/` ≥ 80%.
- **Determinism:** inject `Clock`, no network, no sleeps, replay fixtures for anything that talks to an LLM.

## Gotchas

- **Gemini 3 function calling:** append the model's returned `content` to history unchanged (thought signatures). Never rebuild it from parts.
- **Embeddings:** `gemini-embedding-001` at 768 dimensions must be L2-normalized. Use the task types `RETRIEVAL_DOCUMENT` and `RETRIEVAL_QUERY`.
- **Implicit prompt caching** only hits a byte-identical prefix above the model's minimum size. Keep timestamps, ids and candidate data out of the prefix.
- **LLM response schemas:** Gemini supports a subset of JSON Schema, so keep schemas flat (objects, arrays, enums, strings, numbers). Always re-validate with Zod.
- **Database driver:** use `pg` everywhere (local, CI, Lambda). The Neon HTTP driver can't reach local Postgres.
- **CORS:** the Lambda Function URL owns CORS. Don't add CORS middleware in Hono.
- **API bundle:** pre-bundle with esbuild to `apps/api/dist/lambda.mjs` (ESM, `pg-native` external, target `node24`). SAM only packages `dist/`.
- **Node version:** Node 24 LTS everywhere. Local and CI use exactly `24.21.0` (`.nvmrc`, `engines`, `actions/setup-node` with `node-version-file`). Lambda runs `nodejs24.x`, whose patch version AWS manages, so don't rely on anything newer than 24.21.0. The `nodejs24.x` runtime has no callback-style handlers; handlers must be `async`. npm ships with Node; no corepack.
- **Amplify:** it needs the SPA rewrite rule, and `VITE_API_BASE_URL` is baked in at build time.
- **npm workspaces:** npm hoists every package to the root `node_modules`, so code can import a package its own `package.json` doesn't declare. dependency-cruiser's `no-non-package-json` and `not-to-unresolvable` rules catch this; keep them on. Link workspace packages with `"@hiresignal/contracts": "*"` (npm has no `workspace:` protocol). Commit only `package-lock.json`. Never use `--legacy-peer-deps` or `--force`; resolve peer conflicts with `overrides` in the root `package.json` and say why in the commit message.
- **Windows:** the developer machine runs Windows.
  - Keep LF line endings.
  - Keep package scripts cross-platform (no bash-only syntax).
  - Write anything non-trivial as a `node` script.

## When unsure

- Ask me rather than inventing product behaviour.
- Prefer boring, well-maintained dependencies, and justify each new one in its commit message.
- If a phase is running long, propose items from the SPEC §20 cut list instead of lowering the quality bar.
