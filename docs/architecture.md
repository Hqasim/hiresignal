# Architecture

How HireSignal is put together. Decisions are in the [ADR index](adr/README.md), and the full design is in [SPEC.md](SPEC.md). This page grows phase by phase; as of 2026-10-09 (Phase 2) it covers the system context, the API layers, the LLM platform and the data model.

## System context

```mermaid
flowchart LR
  user([Recruiter / Reviewer]) -->|HTTPS| web["Web SPA<br/>Vite + React + TS<br/>AWS Amplify Hosting"]
  web -->|JSON / HTTPS| api["API<br/>Hono on AWS Lambda (arm64, Node 24)<br/>Lambda Function URL"]
  api -->|"SQL / TLS · hiresignal_app · pooled"| db[("Neon Postgres<br/>+ pgvector")]
  api -->|generate · embed| gem["Gemini API (free key)<br/>Flash-Lite · Flash · gemini-embedding-2"]
  dev([Developer]) -->|git push| gha[GitHub Actions]
  gha -->|"migrations · owner · direct"| db
  gha -->|"OIDC → SAM deploy"| api
  gha -->|static deploy| web
```

- **One Lambda behind a Function URL** serves the whole API ([ADR 0004](adr/0004-single-lambda-behind-a-function-url.md)). The web app is a static SPA on Amplify ([ADR 0017](adr/0017-static-spa-on-amplify-with-ci-deploys.md)).
- **One Postgres database** holds the relational data, the JSONB documents, the vectors and the full-text indexes ([ADR 0005](adr/0005-neon-postgres-pgvector-only-datastore.md)). The Lambda connects as the least-privilege `hiresignal_app` role through Neon's pooler. Migrations run as the owner on the direct endpoint, **before** each code deploy ([ADR 0018](adr/0018-forward-only-migrations-before-deploy.md)).
- **The Gemini API** is reached only through the [LLM platform](#llm-platform): Flash-Lite and Flash for generation, `gemini-embedding-2` for embeddings ([ADR 0007](adr/0007-embedding-model-dimensions-and-normalization.md)). CI and tests replay recorded responses and never call it ([ADR 0009](adr/0009-record-replay-llm-adapter.md)).

## API layers

The API is hexagonal ([ADR 0002](adr/0002-hexagonal-architecture-with-enforced-boundaries.md)). [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) enforces the arrows in CI.

```mermaid
flowchart TD
  main["main/<br/>composition root, entry points, CLIs"] --> interfaces
  main --> infrastructure
  main --> config["config/<br/>env parsing (Zod), AI tunables"]
  interfaces["interfaces/http/<br/>Hono routes, problem+json"] --> application
  infrastructure["infrastructure/<br/>postgres, llm, logging, clock"] --> application
  application["application/<br/>use cases, ports"] --> domain["domain/<br/>entities, branded types, schemas"]
  interfaces --> domain
  infrastructure --> domain
  infrastructure -.->|only layer allowed| pg[(pg)]
  infrastructure -.->|only layer allowed| genai[("@google/genai")]
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

## LLM platform

Every model call goes through two ports in `application/ports/`: `LlmClient` for generation and `Embedder` for embeddings. Use cases name a task (`guard.classify`, `screen.agent`, …), never a model. [`main/llm-wiring.ts`](../apps/api/src/main/llm-wiring.ts) composes the chain once ([ADR 0010](adr/0010-rule-based-routing-with-tier-fallback.md)):

```mermaid
flowchart TD
  uc["Use case<br/>LlmClient.generate({ task, … })"] --> routing
  routing["withRouting<br/>pure policy → tier, model, reason"] -->|RoutedLlmRequest| fallback
  fallback["withFallback<br/>switch tier once → LlmUnavailableError"] --> retry
  retry["withRetry<br/>1 retry · 429 retryDelay ≤ 10 s · backoff + jitter"] --> logging
  logging["withCallLogging<br/>one llm_calls row per attempt"] --> mode{LLM_MODE}
  mode -->|live| gemini["GeminiLlmClient<br/>@google/genai"]
  mode -->|record| recording["RecordingLlmClient<br/>Gemini + write fixture"]
  mode -->|replay| replay["ReplayLlmClient<br/>fixtures/llm/&lt;task&gt;/&lt;hash&gt;.json"]
  recording --> gemini
```

- **Routing is a pure function** ([`domain/routing/policy.ts`](../apps/api/src/domain/routing/policy.ts)). Each task has a default tier; only `ask.answer` escalates to Flash, on comparative intent, candidate count or context size. The reason is stored with every call.
- **Two client types:** use cases hold an `LlmClient`. Only `withRouting` produces the `RoutedLlmRequest` that every inner decorator and provider client requires, so an unrouted call can't compile.
- **Failures are provider-neutral.** Adapters translate SDK errors into `LlmCallError` (`rate_limited`, `unavailable`, `timeout`, `rejected`), and the decorators decide what to retry from that.
- **Model turns are opaque.** `LlmResponse.content` is the provider's turn as JSON, appended unchanged to the next request, which Gemini 3 needs for thought signatures in tool loops.
- **Structured output** goes through [`generateStructured`](../apps/api/src/application/llm/generate-structured.ts): Zod schema → JSON Schema → reply → Zod parse, with one repair turn.
- **Embeddings** get call logging and record/replay, but no retry or fallback: there is no second embedding tier. [`GeminiEmbedder`](../apps/api/src/infrastructure/llm/gemini/gemini-embedder.ts) sends one `Content` per text with retrieval prefixes, checks one 768-d vector per input, and normalizes.
- **Record/replay** keys each fixture by `sha256` of the model and everything that decides the answer ([ADR 0009](adr/0009-record-replay-llm-adapter.md)). `npm run llm:smoke` records one structured call per tier and one embedding; a unit test replays them offline.

## Safety layer

Every resume passes through redaction and the injection guard before anything else reads it ([ADR 0013](adr/0013-layered-injection-defense-and-quarantine-policy.md), [ADR 0014](adr/0014-one-way-redaction-with-branded-types.md)). Everything except the classifier is pure code in `domain/`. The ingest use case composes the steps (next section):

```mermaid
flowchart TD
  raw["Raw Markdown resume"] --> l0["L0 scanInvisible<br/>zero-width · bidi (medium) · tag chars (high)<br/>records, then strips"]
  l0 --> nfkc["NFKC normalize"]
  nfkc --> redact["redact()<br/>PERSON · EMAIL · PHONE · URL · ADDRESS · SCHOOL · GRAD_YEAR<br/>→ RedactedText"]
  redact --> scan["scanRedactedText<br/>L1 hidden markup + L2 rules<br/>high when hidden, medium when visible"]
  scan --> high{"any high signal?"}
  high -->|yes| policy
  high -->|no| l3["L3 classifier · guard.classify · Flash-Lite<br/>spotlighted &lt;untrusted_resume&gt;"]
  l3 --> policy["decideGuard (pure)"]
  policy --> q["quarantined<br/>stored, never chunked or scored"]
  policy --> f["flagged<br/>screened, marked for review"]
  policy --> c["clean<br/>benign mediums kept as dismissed"]
```

- **`RedactedText` is the gate.** Only `redact()` produces it from raw text. The embedder's document path, the classifier and `spotlight()` accept nothing else, so a raw resume can't reach a model and still compile.
- **Severity is about visibility.** An instruction a human can read is medium, and the classifier decides whether the resume is an attack or a résumé _about_ attacks. An instruction a human can't see is high, and quarantines on its own.
- **The policy is a table.** [`decideGuard`](../apps/api/src/domain/guard/policy.ts) is pure. Its tests cover every row, including the 0.7 confidence boundary.
- **Spotlighting** ([`spotlight.ts`](../apps/api/src/application/prompts/spotlight.ts)) wraps untrusted text in `<untrusted_*>` tags and neutralizes wrapper-like tags inside it, so content can't close its own wrapper.

## Ingestion and seeding

`npm run seed` loads `data/` into Postgres through [`createIngestResume`](../apps/api/src/application/ingest/ingest-resume.ts), one resume at a time (SPEC §9.5, [ADR 0019](adr/0019-section-aware-chunking-with-exact-offsets.md)):

```mermaid
sequenceDiagram
  participant CLI as seed CLI (main/cli/seed.ts)
  participant DS as readDataset (infrastructure/dataset)
  participant S as createSeedJob
  participant I as createIngestResume
  participant L3 as classify (guard.classify)
  participant E as Embedder
  participant DB as Postgres (owner role)
  CLI->>DS: data/jobs/*.md, data/resumes/cNN-*.md
  DS-->>CLI: job + resumes (sha256 source hashes, escapes decoded)
  CLI->>S: seed({ job, resumes, reset })
  S->>DB: upsert job (and delete its candidates on --reset)
  loop each resume, in alias order
    S->>I: ingest(source)
    I->>DB: findBySourceHash
    alt already stored
      I-->>S: skipped (no model call)
    else new
      I->>I: prepareResume: L0 → NFKC → redact → L1 + L2
      opt no high signal
        I->>L3: spotlighted RedactedText
      end
      I->>I: decideGuard
      opt clean or flagged
        I->>I: chunkResume (exact offsets, context headers)
        I->>E: embedDocuments(header + content), one call
      end
      I->>DB: insertIngested (candidate + chunks, one transaction)
      I-->>S: outcome (alias, status, signal ids, counts)
    end
  end
  S-->>CLI: outcomes → table + model-call tally
```

- **Modes.** `--mode replay` (the default) reads fixtures and needs no key. `record` calls Gemini and saves fixtures, and `seed:record` always adds `--reset`, so a recording is complete. `live` only calls Gemini. Live calls are spaced by `SEED_MIN_CALL_INTERVAL_MS`, using a throttle just above the provider clients.
- **One wiring.** [`createSeeder`](../apps/api/src/main/seed-wiring.ts) builds the seeder for both the CLI and the replay integration test, so replay sends byte-identical requests to the recorded ones.
- **Idempotent.** A second run skips stored resumes before any model call. A fallback during recording would save a fixture under the wrong model, so the CLI reports fallbacks and fails if one happened.
- **As of 2026-10-09,** a replay seed of the 10 resumes takes 2.5 s locally with 0 live calls. It yields 8 clean candidates with 53 chunks, and 2 quarantined candidates with none.

## Screening and scorecards

[`createScreenCandidate`](../apps/api/src/application/screening/screen-candidate.ts) screens one candidate in two stages behind one cacheable prefix (SPEC §9.6; [ADR 0011](adr/0011-prompt-caching-via-byte-stable-prefixes.md), [ADR 0012](adr/0012-deterministic-scoring-with-verified-citations.md), [ADR 0020](adr/0020-evidence-gathering-agent-with-separate-synthesis.md)):

```mermaid
sequenceDiagram
  participant UC as createScreenCandidate
  participant A as runScreeningAgent
  participant LLM as LlmClient (routed)
  participant T as screening tools (one candidate)
  participant DB as Postgres
  UC->>DB: candidate, job, outline (refs + headers)
  Note over UC: quarantined → CandidateQuarantinedError, no model call
  UC->>A: prefix (system) + tools + spotlighted outline
  loop at most MAX_AGENT_STEPS turns
    A->>LLM: screen.agent (Flash-Lite)
    LLM-->>A: function calls, or DONE
    A->>T: search_resume / read_section (Zod-validated)
    T->>DB: embedQuery → hybrid search, or getSection, filtered to the candidate
    T-->>A: spotlighted chunks with refs (no scores)
    A->>LLM: model turn unchanged + tool results
  end
  A-->>UC: evidence set (deduplicated, resume order) + trace
  UC->>LLM: screen.synthesize (Flash): same prefix, fresh conversation, evidence, ScorecardDraft schema
  LLM-->>UC: draft
  UC->>UC: verifyDraft (refs, quotes, coverage)
  opt any error
    UC->>LLM: screen.repair: the exact errors
    UC->>UC: verify again
  end
  UC->>UC: finalizeAssessments (strict downgrade) → computeScore
  UC->>DB: append scorecard (result, trace, prompt version, models)
```

- **The prefix is shared and byte-stable.** [`buildScreeningPrefix`](../apps/api/src/application/prompts/screening-prefix.ts) is the system instruction of every agent, synthesis and repair call for a job. A test pins it as identical across candidates, free of ids and dates, and at least 4,506 estimated tokens (it is 5,239).
- **Tools can't leave the candidate.** The use case fixes the job and candidate ids; no argument can change them. Invalid arguments come back to the model as errors.
- **The model never writes the score.** Code verifies every quote against the retrieved chunk content, and the stored spans come from code. A requirement that still fails after one repair becomes `unclear`, worth 0.
- **Seeding precomputes.** [`createScreenPool`](../apps/api/src/application/screening/screen-pool.ts) screens every clean or flagged candidate after ingestion and skips any that already has a scorecard ([ADR 0015](adr/0015-precomputed-results-and-a-daily-call-cap.md)).
- **HTTP.** `GET /api/jobs`, `/api/jobs/:slug`, `/api/jobs/:slug/candidates` and `GET /api/candidates/:id` serve stored data. `POST …/shortlist` reveals the name. `POST …/screen` re-runs screening live behind the daily-cap middleware (429 with `Retry-After`).

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
