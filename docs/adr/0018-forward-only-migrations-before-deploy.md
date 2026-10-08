# 0018. Forward-only SQL migrations, run before the code deploy

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The schema lives in plain SQL files in `db/migrations/`. Three environments apply them:

- local Docker
- CI's service container
- Neon, from the deploy workflow

SPEC §15 originally ordered the deploy as "SAM deploy, then migrate". With that order, a release that adds a column briefly runs new code against the old schema and fails until the migration lands. The deploy can also be re-run or race another run, so applying migrations must be safe to repeat and to run concurrently.

## Decision

**A small, hand-written migrator** ([`infrastructure/postgres/migrator.ts`](../../apps/api/src/infrastructure/postgres/migrator.ts)), run by `npm run db:migrate` ([`main/cli/migrate.ts`](../../apps/api/src/main/cli/migrate.ts)):

- **Ordering:** files named `NNNN_snake_case.sql` are applied in version order.
- **Atomicity:** each file runs in its own transaction, together with its row in `schema_migrations(version, checksum, applied_at)`. A failed file leaves no trace, and the next run retries it.
- **Concurrency:** a session-level advisory lock is held for the whole run, so concurrent runs queue instead of racing. That's why migrations connect through the direct endpoint as the owner (`DATABASE_MIGRATION_URL`), never through the transaction pooler (ADR 0006).
- **Forward-only:** the sha256 of each applied file (line endings normalized) is stored. If an applied file is edited or deleted, the run fails before doing anything. To change the schema, add a migration.
- **Idempotent SQL where practical:** `if not exists` on tables, indexes and the extension.

**Migrations run before the code deploy.** In [`deploy.yml`](../../.github/workflows/deploy.yml) the order is: migrate Neon → `sam deploy` → smoke test.

So every migration must be **additive** (expand/contract): the version still running has to work with the new schema. Removing or renaming a column takes two releases: stop using it, then drop it.

CI runs `db:migrate` twice against its service container before the integration tests, and [`migrations.test.ts`](../../apps/api/test/integration/migrations.test.ts) covers:

- a clean apply
- a no-op re-run
- a tampered checksum
- a deleted file
- a failed migration rolling back
- the least-privilege role grants

## Consequences

- **Positive:**
  - The running code never sees a schema older than it expects.
  - Re-running a deploy is safe, and concurrent deploys can't apply a migration twice.
  - Editing history fails loudly instead of silently diverging between environments.
  - About 100 lines with no new dependency. Reviewers read the whole mechanism in one file.
- **Negative:**
  - Expand/contract discipline is a convention, not an automated check. A destructive migration would still break the running version for the length of a deploy.
  - No down migrations. Rolling back means a new forward migration plus reverting the code.
  - If the migration succeeds and `sam deploy` fails, production runs old code on the new schema until the next deploy. That's acceptable because the change is additive.

## Alternatives considered

- **Deploy the code first, then migrate (the original SPEC §15 order).** Rejected: every schema-dependent release would fail requests between the two steps.
- **A migration tool (node-pg-migrate, Flyway, Atlas, Prisma Migrate).** Rejected: each adds a dependency or a binary for what is two SQL files and a lock here. Most of them encourage down migrations, which we don't want to maintain. Plain SQL also keeps the schema readable as the spec presents it.
- **Migrate on Lambda cold start.** Rejected: it gives the runtime role DDL rights, which breaks the least-privilege split (ADR 0005), and every concurrent cold start would contend for the lock.
