# db

Plain SQL migrations for the one Postgres database (Neon in production, `pgvector/pgvector:pg18` locally and in CI). The schema and its ERD are described in [`docs/architecture.md`](../docs/architecture.md#data-model).

- **`migrations/NNNN_description.sql`:** applied in order by `npm run db:migrate` ([`migrate.ts`](../apps/api/src/main/cli/migrate.ts)), which records each version with a checksum in `schema_migrations` and refuses to start if an applied file has changed.
  - `0001_init.sql`: the `vector` extension and the five tables (`jobs`, `candidates`, `resume_chunks`, `scorecards`, `llm_calls`), with the HNSW and full-text indexes.
  - `0002_app_role_grants.sql`: the least-privilege grants for `hiresignal_app`, the role the Lambda connects as (select, insert and update; no delete, no DDL).
- **Forward-only and additive** ([ADR 0018](../docs/adr/0018-forward-only-migrations-before-deploy.md)). Production migrates before the new code is deployed, so a migration must work with the code that is already running. Never edit an applied file; add a new one.
- **Run as the owner** (`DATABASE_MIGRATION_URL`, Neon's direct endpoint). The Lambda never runs DDL.
