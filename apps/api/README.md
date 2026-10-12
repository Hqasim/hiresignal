# @hiresignal/api

The HireSignal HTTP API: Hono on AWS Lambda behind a Function URL, built as a hexagonal (ports and adapters) application.

| Layer                                          | Responsibility                                    | May import                                         |
| ---------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| [`src/domain/`](src/domain/)                   | Pure rules and types                              | `domain/`, `zod`                                   |
| [`src/application/`](src/application/)         | Use cases, ports, prompt builders, output schemas | `domain/`, `zod`                                   |
| [`src/infrastructure/`](src/infrastructure/)   | Adapters (Gemini, Postgres, logger, clock)        | `application/`, `domain/`, SDKs                    |
| [`src/interfaces/http/`](src/interfaces/http/) | Hono routes, middleware, problem+json             | `application/`, `domain/`, `@hiresignal/contracts` |
| [`src/config/`](src/config/)                   | Env parsing and AI tunables                       | `zod`                                              |
| [`src/main/`](src/main/)                       | Composition root and entry points                 | everything                                         |

dependency-cruiser enforces these rules (`npm run depcruise`); see [ADR 0002](../../docs/adr/0002-hexagonal-architecture-with-enforced-boundaries.md).

## Scripts

| Command                                       | What it does                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run dev -w @hiresignal/api`              | Local server on `:3000` with reload; reads the root `.env`                                                           |
| `npm run start -w @hiresignal/api`            | The same server without reload (E2E starts it with `LLM_MODE=replay`)                                                |
| `npm run build -w @hiresignal/api`            | esbuild bundle to `dist/lambda.mjs` (ESM, `node24`)                                                                  |
| `npm run test:unit -w @hiresignal/api`        | Unit and route tests with coverage gates                                                                             |
| `npm run test:integration -w @hiresignal/api` | Integration tests against local Postgres (`npm run db:up`)                                                           |
| `npm run db:migrate -w @hiresignal/api`       | Apply `db/migrations/*.sql` using `DATABASE_MIGRATION_URL`                                                           |
| `npm run llm:smoke -w @hiresignal/api`        | Live check of the Gemini key and model IDs; records fixtures (needs `GEMINI_API_KEY`)                                |
| `npm run seed -w @hiresignal/api`             | Load the demo job and resumes and precompute scorecards (replay; `-- --reset` re-ingests)                            |
| `npm run ask:golden -w @hiresignal/api`       | Ask the seeded job the golden questions and print recall@5 and MRR (replay)                                          |
| `npm run eval -w @hiresignal/api`             | The four eval suites against their gates (replay); `-- --write` updates `docs/evals.md` and the README's gates table |

Recorded model responses live in [`fixtures/llm/`](fixtures/llm/), one folder per task. Tools write them; never edit them by hand ([ADR 0009](../../docs/adr/0009-record-replay-llm-adapter.md)).

The eval suites and their gates live in [`evals/`](evals/), outside `src/`: they score the product, they aren't part of it ([`docs/evals.md`](../../docs/evals.md)).
