# 0007. Embedding model, dimensions and normalization

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

Resume chunks and queries are embedded once and searched with pgvector's cosine distance (`<=>`) behind an HNSW index ([ADR 0005](0005-neon-postgres-pgvector-only-datastore.md)). Four constraints shape the choice:

- **Cost:** the model must run on the free Gemini key.
- **Index size:** pgvector's HNSW index accepts at most 2,000 dimensions.
- **Asymmetric search:** a short recruiter question or agent query has to retrieve a longer resume chunk.
- **Plain arithmetic:** vectors should be unit length, so cosine similarity is a dot product and the `SIMILARITY_FLOOR` check (§9.7) means the same thing everywhere.

SPEC first named `gemini-embedding-001`. By build day (2026-10-08), Google listed `gemini-embedding-2` as its stable embedding model. The [Gemini embeddings guide](https://ai.google.dev/gemini-api/docs/embeddings), read on 2026-10-08, says:

- **No task types:** `gemini-embedding-2` doesn't accept `taskType`. The retrieval intent goes into the text instead. A query is `task: search result | query: {content}`; a document is `title: {title} | text: {content}`, with `title: none` when there's no title.
- **Normalized at reduced sizes:** truncated outputs such as 768 dimensions come back normalized. `gemini-embedding-001` needs manual normalization at every size below 3,072.
- **Separate inputs:** passing several plain strings in `contents` produces **one** combined embedding. Each input must be its own `Content` object to get one embedding per input.
- **Input limit:** 8,192 tokens, against 2,048 for 001.
- **Incompatible spaces:** vectors from the two models can't be mixed, so switching later means re-embedding everything.

## Decision

Embed with **`gemini-embedding-2` at 768 dimensions**. Code that sends the requests lives in `infrastructure/llm/gemini/gemini-embedder.ts`, and the vector maths in [`domain/vectors/`](../../apps/api/src/domain/vectors/unit-vector.ts).

- **The model ID comes from env:** `GEMINI_EMBEDDING_MODEL` ([ADR 0016](0016-secrets-via-github-environments.md)). The adapter's prompt format assumes embedding-2, so changing the ID to another model family needs an adapter change and an update to this ADR.
- **768 dimensions:** requested with `outputDimensionality: 768` and stored as `vector(768)` (`EMBEDDING_DIMENSIONS` in `config/ai.ts`).
- **Retrieval prefixes:**
  - documents are sent as `title: none | text: {context header + chunk}`
  - queries are sent as `task: search result | query: {question}`

  The adapter adds the prefixes, so callers pass plain text. The prefixes are versioned as `GEMINI_EMBEDDING_INPUT_FORMAT`, and that version is part of every embedding fixture key, so changing a prefix forces a re-record ([ADR 0009](0009-record-replay-llm-adapter.md)).

- **One `Content` per text:** batches send one `Content` object per input. The adapter checks that the response holds exactly one 768-dimension vector per input, and throws otherwise, so a merged embedding can't be stored silently.
- **Normalize anyway:** every vector goes through `normalize()` before it becomes a `UnitVector`. On embedding-2 output it's a no-op. It keeps the unit-length invariant true even if the model ID changes, and it's cheap.
- **Batching:** documents go in batches of `EMBEDDING_BATCH_SIZE`, sized so a batch of maximum-size chunks stays under the 8,192-token limit.
- **Resume text arrives redacted:** `Embedder.embedDocuments` accepts only `RedactedText`. Queries go through `embedQuery`, which takes a plain string, because questions aren't resume text.

## Consequences

- **Positive:**
  - Google's current stable embedding model, with four times the input limit of 001.
  - Normalization is guaranteed twice: by the model at reduced sizes, and by our own `normalize()`.
  - 768 dimensions fit HNSW's limit and keep rows small. The demo stores about a hundred chunks.
  - Query and document prefixes are visible in code and fixtures, not hidden in an enum.
- **Negative:**
  - The prefix format is a convention the model was trained on, not an API contract. If Google changes the recommended prompts, retrieval quality could drift without an error. The retrieval eval (Phase 9) is the guard.
  - The docs don't say whether embedding-2 is on the free tier. `npm run llm:smoke` checks this before anything depends on it. If it isn't, we switch to 001 and update this ADR.
  - Batching with one `Content` per input is inferred from the docs' multimodal example. The count check turns any mismatch into a loud error, and the Phase 4 recording is the first real test at volume.
  - Switching models later means re-embedding every chunk and re-recording every embedding fixture.

## Alternatives considered

- **`gemini-embedding-001` with `RETRIEVAL_DOCUMENT` and `RETRIEVAL_QUERY` task types.** This was SPEC's original choice. Rejected: it's the older, text-only model with a 2,048-token limit. Task types are tidier than text prefixes, but they don't outweigh the newer model, and 001 needs manual normalization at 768 dimensions.
- **Full 3,072 dimensions.** Rejected: over HNSW's 2,000-dimension limit. It would force exact scans or `halfvec`, and quadruple storage for no measurable gain on ten resumes.
- **A local open-source embedding model (for example via transformers.js).** Rejected: it adds hundreds of megabytes to the Lambda bundle and its cold start, and a portfolio reader would expect the same provider throughout.
