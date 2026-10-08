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

| Command                                       | What it does                                               |
| --------------------------------------------- | ---------------------------------------------------------- |
| `npm run dev -w @hiresignal/api`              | Local server on `:3000` with reload; reads the root `.env` |
| `npm run build -w @hiresignal/api`            | esbuild bundle to `dist/lambda.mjs` (ESM, `node24`)        |
| `npm run test:unit -w @hiresignal/api`        | Unit and route tests with coverage gates                   |
| `npm run test:integration -w @hiresignal/api` | Integration tests against local Postgres (`npm run db:up`) |
| `npm run db:migrate -w @hiresignal/api`       | Apply `db/migrations/*.sql` using `DATABASE_MIGRATION_URL` |
