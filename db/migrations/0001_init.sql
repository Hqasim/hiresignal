-- HireSignal schema (SPEC §8). Forward-only: never edit this file once applied; add a new migration.
-- The runner wraps each file in a transaction and records it in schema_migrations.

create extension if not exists vector;

create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  company       text not null,
  description   text not null,
  requirements  jsonb not null,          -- [{ id, text, kind: 'must'|'nice', weight }]
  created_at    timestamptz not null default now()
);

create table if not exists candidates (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references jobs(id) on delete cascade,
  alias              text not null,               -- 'C01' … shown everywhere until shortlisted
  display_name       text not null,               -- synthetic; returned only when shortlisted_at is set
  source_hash        text not null,               -- sha256 of the source file; makes seeding idempotent
  redacted_resume    text not null,
  redaction_summary  jsonb not null,              -- [{ type, count }]
  guard_status       text not null check (guard_status in ('clean','flagged','quarantined')),
  guard_verdict      jsonb not null,              -- { signals: [...], classifier: {...}, dismissed: [...] }
  shortlisted_at     timestamptz,
  created_at         timestamptz not null default now(),
  unique (job_id, alias),
  unique (job_id, source_hash)
);

create table if not exists resume_chunks (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references candidates(id) on delete cascade,
  ordinal         int  not null,
  section         text not null,                 -- 'summary' | 'experience' | 'projects' | 'skills' | 'education' | …
  context_header  text not null,                 -- e.g. 'C04 · Experience · Senior Engineer, Acme (2021–2024)'
  content         text not null,                 -- exact slice of redacted_resume
  start_offset    int  not null,                 -- offsets into candidates.redacted_resume
  end_offset      int  not null,
  token_estimate  int  not null,
  embedding       vector(768) not null,          -- embedded text = context_header + content
  content_tsv     tsvector generated always as
                    (to_tsvector('english'::regconfig, context_header || ' ' || content)) stored,
  unique (candidate_id, ordinal)
);
create index if not exists resume_chunks_embedding_hnsw on resume_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists resume_chunks_tsv_gin       on resume_chunks using gin (content_tsv);

create table if not exists scorecards (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references candidates(id) on delete cascade,
  score             int  not null check (score between 0 and 100),
  must_haves_met    int  not null,
  must_haves_total  int  not null,
  result            jsonb not null,              -- validated ScorecardResult (ratings, rationales, citations, strengths, concerns, summary)
  trace             jsonb not null,              -- agent steps: tool, args, returned refs, latency, tokens (no resume text)
  prompt_version    text not null,
  models            jsonb not null,              -- { agent, synthesis }
  created_at        timestamptz not null default now()
);
create index if not exists scorecards_candidate_latest on scorecards (candidate_id, created_at desc);

create table if not exists llm_calls (
  id              bigint generated always as identity primary key,
  request_id      text,
  task            text not null,
  model           text not null,
  tier            text not null check (tier in ('lite','flash','embedding')),
  routed_reason   text not null,
  is_fallback     boolean not null default false,
  source          text not null check (source in ('live','replay')),
  status          text not null check (status in ('ok','error','rate_limited','timeout')),
  input_tokens    int,
  output_tokens   int,
  cached_tokens   int,
  latency_ms      int not null,
  prompt_version  text,
  created_at      timestamptz not null default now()
);
create index if not exists llm_calls_created_at on llm_calls (created_at desc);
