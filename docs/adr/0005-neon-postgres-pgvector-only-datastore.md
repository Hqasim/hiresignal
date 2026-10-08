# 0005. Neon Postgres + pgvector as the only datastore

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

HireSignal stores four kinds of data:

- relational records: jobs, candidates, scorecards and the LLM call log
- JSON documents: requirements, guard verdicts, scorecard results and agent traces
- 768-dimension embeddings for vector search
- full-text indexes for keyword search

Retrieval fuses vector and keyword rankings in one query, filtered by job and by guard status (SPEC §9.7). The project has to cost $0 a month (SPEC §16), run the same schema locally, in CI and in production, and stay small enough for a reviewer to read in one sitting.

## Decision

One Postgres database holds everything, with the `pgvector` extension. The schema is [`db/migrations/0001_init.sql`](../../db/migrations/0001_init.sql):

- **Relational tables:** `jobs`, `candidates`, `resume_chunks`, `scorecards`, `llm_calls`, with foreign keys, `check` constraints on every status, and uniqueness that makes seeding idempotent (`(job_id, source_hash)`).
- **JSONB** for document-shaped values. Every JSONB column is validated with a Zod schema when it's read back ([`infrastructure/postgres/*-rows.ts`](../../apps/api/src/infrastructure/postgres/)).
- **Vectors:** `resume_chunks.embedding vector(768)` with an HNSW index on cosine distance.
- **Full text:** a generated `tsvector` column (`content_tsv`) with a GIN index.
- **Hybrid search:** one SQL statement in [`pg-chunk-repository.ts`](../../apps/api/src/infrastructure/postgres/pg-chunk-repository.ts) ranks both arms and fuses them with reciprocal rank fusion (ADR 0008).

Production runs on **Neon's free plan** in AWS `us-east-1`, the same region as the Lambda. Local development and CI run `pgvector/pgvector:pg17` in Docker ([`docker-compose.yml`](../../docker-compose.yml) and the CI service container).

Access is split across two roles ([`0002_app_role_grants.sql`](../../db/migrations/0002_app_role_grants.sql)):

- the **owner** runs migrations through Neon's direct endpoint
- the Lambda connects as **`hiresignal_app`** through the pooled endpoint, with `select`, `insert` and `update` only: no `delete` and no DDL

## Consequences

- **Positive:**
  - One store, one backup story, one connection string per role. Filtering vector search by job and guard status is a plain SQL `where` clause, with no cross-store sync.
  - Vector and keyword ranking happen in the same statement, so fusion needs no application-side merging.
  - Integration tests run against the real engine and extension, so the SQL in production is the SQL under test.
  - $0: the free plan (as of 2026-10-08: 1 GB of storage and 100 CU-hours per project per month) is far more than the demo needs.
- **Positive:** a compromised Lambda can't delete data or change the schema.
- **Negative:**
  - Neon suspends the compute after 5 minutes idle. The first query afterwards waits for it to resume, so the pool's connect timeout is generous and the web app calls `/api/health` on load to wake it (runbook: "Neon cold starts").
  - On tiny data the planner may prefer a sequential scan to the HNSW index. Results are still correct; ADR 0008 records the `EXPLAIN` output.
  - pgvector caps HNSW at 2,000 dimensions, which rules out some embedding models at full size. 768 fits (ADR 0007).

## Alternatives considered

- **A dedicated vector database (Pinecone, Qdrant Cloud, Weaviate) next to Postgres.** Rejected: a second store to provision, secure and keep in sync. Filtering by job and guard status would need duplicated metadata, and keyword search would still live elsewhere.
- **DynamoDB, plus OpenSearch for search.** Rejected: OpenSearch has no free always-on tier. DynamoDB would also push joins and ranking into application code.
- **Supabase Postgres.** Rejected, narrowly: it offers the same engine and pgvector, but its free projects pause after a week of inactivity and must be restored by hand. Neon's scale-to-zero resumes automatically on the next connection.
- **SQLite with `sqlite-vec` bundled into the Lambda.** Rejected: Lambda's filesystem is ephemeral and per-instance, so shortlists and live re-screens wouldn't persist or be shared between instances.
