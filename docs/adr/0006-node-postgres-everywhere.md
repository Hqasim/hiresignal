# 0006. node-postgres everywhere

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The API runs in three places:

- locally against Docker Postgres
- in CI against a service container
- on AWS Lambda against Neon

Neon offers its own serverless driver (HTTP and WebSockets) aimed at edge runtimes, but that driver can't reach a plain local Postgres. The repositories need parameterized SQL, transactions (ingestion writes a candidate and its chunks atomically) and array parameters for bulk inserts. On Lambda, an instance handles one request at a time and can be frozen between invocations.

## Decision

Use **[`pg`](https://node-postgres.com/) (node-postgres) 8.23.1** in every environment, and import it only under `infrastructure/` (dependency-cruiser rule `sdks-only-in-infrastructure`).

- **One pool per process,** created in [`main/container.ts`](../../apps/api/src/main/container.ts) by [`createPool`](../../apps/api/src/infrastructure/postgres/create-pool.ts). Adapters receive it as a parameter. Connecting is lazy, so creating the pool at cold start costs nothing.
- **Pool settings** (named constants with their reasons in `create-pool.ts`):
  - at most 3 connections
  - a 10 s connect timeout, which covers Neon resuming from scale-to-zero
  - a 10 s idle timeout, so a thawed Lambda is less likely to reuse a socket the server has closed
  - a 15 s client-side query timeout. It's not a `statement_timeout` startup parameter, which a transaction-mode pooler may reject.
- **Pool errors:** an `error` listener logs `db.pool_error`. Without it, a dropped idle connection would crash the process.
- **Two connection strings** ([ADR 0016](0016-secrets-via-github-environments.md) keeps both as secrets):
  - `DATABASE_URL`: the `hiresignal_app` role on Neon's **pooled** endpoint (PgBouncer in transaction mode), used by the Lambda
  - `DATABASE_MIGRATION_URL`: the owner on the **direct** endpoint, used by the migration CLI, which holds a session-level advisory lock that a transaction pooler can't keep (ADR 0018)
- **TLS:**
  - Production URLs use `sslmode=verify-full`. node-postgres treats `require` as an alias for `verify-full` and warns that libpq semantics will change, so we write the mode we mean.
  - The pool enables channel binding (SCRAM-SHA-256-PLUS), which is what Neon's `channel_binding=require` asks libpq for. It's used whenever the server offers it over TLS.
- **No application state on the pooled connection:** no `SET`, no session advisory locks, no named prepared statements.
- **Rows are validated:** every query goes through [`queryRows`](../../apps/api/src/infrastructure/postgres/query-rows.ts), which parses each row with a Zod schema before it's mapped to a domain type.
- **The bundle:** esbuild bundles `pg` into the ESM `dist/lambda.mjs`, with `pg-native` left external. The bundle smoke test points `DATABASE_URL` at a closed port and expects `db: "down"`, which proves the driver loads and runs inside the bundle.

## Consequences

- **Positive:**
  - The same driver, SQL and behaviour in every environment. Integration tests exercise production code paths.
  - Full Postgres protocol: transactions, `unnest` array parameters, pgvector literals cast with `::vector`.
  - Mature and widely understood, with no install scripts.
- **Negative:**
  - A TCP connection per Lambda instance instead of stateless HTTP queries. The pooled endpoint absorbs this; Neon's PgBouncer accepts up to 10,000 client connections (Neon docs, 2026-10-08).
  - The first query after a long freeze can hit a stale connection. The health route degrades instead of crashing, and the idle timeout keeps the window small. If it shows up in practice, a single retry on connection errors in the probe is the next step.

## Alternatives considered

- **`@neondatabase/serverless` (HTTP and WebSocket driver).** Rejected: it can't connect to the local Docker Postgres or the CI service container, so tests would run against a different driver than production.
- **`postgres` (porsager/postgres).** Rejected, narrowly: an excellent driver with tagged-template SQL, but its automatic prepared statements need care behind a transaction-mode pooler, and `pg` is the baseline most reviewers already know.
- **An ORM or query builder (Prisma, Drizzle, Kysely).** Rejected: the most interesting query is hand-written hybrid search SQL, which an ORM would hide or bypass. Prisma also adds a query engine binary to the Lambda bundle. Plain parameterized SQL plus Zod row schemas gives type safety at the boundary with less machinery.
