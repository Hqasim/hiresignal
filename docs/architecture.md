# Architecture

How HireSignal is put together. Decisions are in the [ADR index](adr/README.md), and the full design is in [SPEC.md](SPEC.md). This page grows phase by phase; as of 2026-10-08 (Phase 1) it covers the system context, the API layers and the data model.

## System context

```mermaid
flowchart LR
  user([Recruiter / Reviewer]) -->|HTTPS| web["Web SPA<br/>Vite + React + TS<br/>AWS Amplify Hosting"]
  web -->|JSON / HTTPS| api["API<br/>Hono on AWS Lambda (arm64, Node 24)<br/>Lambda Function URL"]
  api -->|"SQL / TLS · hiresignal_app · pooled"| db[("Neon Postgres<br/>+ pgvector")]
  api -->|generate · embed| gem["Gemini API (free key)<br/>Flash-Lite · Flash · gemini-embedding-001"]
  dev([Developer]) -->|git push| gha[GitHub Actions]
  gha -->|"migrations · owner · direct"| db
  gha -->|"OIDC → SAM deploy"| api
  gha -->|static deploy| web
```

- **One Lambda behind a Function URL** serves the whole API ([ADR 0004](adr/0004-single-lambda-behind-a-function-url.md)). The web app is a static SPA on Amplify ([ADR 0017](adr/0017-static-spa-on-amplify-with-ci-deploys.md)).
- **One Postgres database** holds the relational data, the JSONB documents, the vectors and the full-text indexes ([ADR 0005](adr/0005-neon-postgres-pgvector-only-datastore.md)). The Lambda connects as the least-privilege `hiresignal_app` role through Neon's pooler. Migrations run as the owner on the direct endpoint, **before** each code deploy ([ADR 0018](adr/0018-forward-only-migrations-before-deploy.md)).
- **The Gemini API** is wired in Phase 2.

## API layers

The API is hexagonal ([ADR 0002](adr/0002-hexagonal-architecture-with-enforced-boundaries.md)). [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) enforces the arrows in CI.

```mermaid
flowchart TD
  main["main/<br/>composition root, entry points, CLIs"] --> interfaces
  main --> infrastructure
  main --> config["config/<br/>env parsing (Zod)"]
  interfaces["interfaces/http/<br/>Hono routes, problem+json"] --> application
  infrastructure["infrastructure/<br/>postgres, logging, clock"] --> application
  application["application/<br/>use cases, ports"] --> domain["domain/<br/>entities, branded types, schemas"]
  interfaces --> domain
  infrastructure --> domain
  infrastructure -.->|only layer allowed| pg[(pg)]
```

Persistence follows ports and adapters ([ADR 0006](adr/0006-node-postgres-everywhere.md)):

| Port (`application/ports/`) | Adapter (`infrastructure/postgres/`) | Methods                                                                                       |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `JobRepository`             | `pg-job-repository.ts`               | `upsert`, `findBySlug`, `list`                                                                |
| `CandidateRepository`       | `pg-candidate-repository.ts`         | `insertIngested` (candidate + chunks, one transaction), `findById`, `listRanked`, `shortlist` |
| `ChunkRepository`           | `pg-chunk-repository.ts`             | `hybridSearch` (vector + keyword, RRF), `getSection`, `getByRefs`                             |
| `ScorecardRepository`       | `pg-scorecard-repository.ts`         | `save`, `latestFor`                                                                           |
| `LlmCallRepository`         | `pg-llm-call-repository.ts`          | `record`, `countLiveSince` (Phase 7 adds the ops queries)                                     |
| `DatabaseProbe`             | `pg-database-probe.ts`               | `ping` (used by `GET /api/health`)                                                            |

Every row read back is parsed with a Zod schema (`*-rows.ts`) before it becomes a domain type, so JSONB that drifts from the code fails loudly at the boundary.

## Data model

The schema is [`db/migrations/0001_init.sql`](../db/migrations/0001_init.sql). [`0002_app_role_grants.sql`](../db/migrations/0002_app_role_grants.sql) gives `hiresignal_app` `select`, `insert` and `update`, with no `delete` and no DDL.

```mermaid
erDiagram
  jobs ||--o{ candidates : has
  candidates ||--o{ resume_chunks : "split into"
  candidates ||--o{ scorecards : "scored by"

  jobs {
    uuid id PK
    text slug UK
    text title
    text company
    text description
    jsonb requirements "id, text, kind must|nice, weight"
    timestamptz created_at
  }
  candidates {
    uuid id PK
    uuid job_id FK
    text alias "C01; unique per job"
    text display_name "revealed only when shortlisted"
    text source_hash "unique per job; idempotent seeding"
    text redacted_resume "never the original"
    jsonb redaction_summary "type, count"
    text guard_status "clean | flagged | quarantined"
    jsonb guard_verdict "signals, classifier, dismissed"
    timestamptz shortlisted_at
    timestamptz created_at
  }
  resume_chunks {
    uuid id PK
    uuid candidate_id FK
    int ordinal "ref C04#3; unique per candidate"
    text section
    text context_header
    text content "exact slice of redacted_resume"
    int start_offset
    int end_offset
    int token_estimate
    vector embedding "768-d, HNSW cosine"
    tsvector content_tsv "generated, GIN"
  }
  scorecards {
    uuid id PK
    uuid candidate_id FK
    int score "0-100, computed in code"
    int must_haves_met
    int must_haves_total
    jsonb result "ratings, citations, summary"
    jsonb trace "tool calls by ref, no resume text"
    text prompt_version
    jsonb models "agent, synthesis"
    timestamptz created_at
  }
  llm_calls {
    bigint id PK
    text request_id
    text task
    text model
    text tier "lite | flash | embedding"
    text routed_reason
    boolean is_fallback
    text source "live | replay"
    text status "ok | error | rate_limited | timeout"
    int input_tokens
    int output_tokens
    int cached_tokens
    int latency_ms
    text prompt_version
    timestamptz created_at
  }
  schema_migrations {
    text version PK
    text checksum "sha256 of the applied file"
    timestamptz applied_at
  }
```

- **Quarantined candidates** keep their redacted text and verdict but never get chunks. The `IngestedCandidate` type enforces this, and every retrieval query filters them out as well.
- **Scorecards are append-only.** Re-screening adds a row, and readers take the newest one (`scorecards_candidate_latest` index).
- **`llm_calls` stores metadata only:** no prompts, resume text or model output.
