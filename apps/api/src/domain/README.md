# domain

Pure business rules: entities, branded types, redaction, guard rules and policy, chunking, routing policy, scoring, citation checks, vector math.

- **What belongs here:** synchronous, deterministic functions and types. No I/O, no `Date.now()`, no unseeded randomness; take a `Clock` value or timestamp as input instead.
- **Allowed imports:** other `domain/` modules and `zod`. Node built-ins and SDKs are forbidden (dependency-cruiser `domain-is-pure`).
- **Tests:** next to the code (`*.test.ts`); coverage gate ≥ 90% lines and branches, and ≥ 95% for `redaction/` and `guard/`. Dataset tests (`*-dataset.test.ts`) run the pure pipeline over `data/evals/`; fast-check property tests cover redaction and chunking.
- **Entry points:**
  - `shared/assert-never.ts` for exhaustive switches; `shared/untrusted-text.ts` brands questions and agent queries
  - `redaction/redact.ts`: `redact()`, the only producer of `RedactedText` from raw text; `redaction/redacted-text.ts` also has `sliceRedactedText` and `joinRedactedText` for derived text (ADR 0014)
  - `ingestion/prepare-resume.ts`: `prepareResume()`, the deterministic half of ingestion (L0 → NFKC → redact → L1 + L2)
  - `chunking/chunk-resume.ts`: `chunkResume()` and `toEmbeddingInput()`, section-aware chunks with exact offsets (ADR 0019)
  - `guard/`: `invisible.ts` (L0), `hidden-markup.ts` (L1), `rules.ts` (L2), `scan.ts` (L1 + L2 severities), `policy.ts` (`decideGuard`, `shouldRunClassifier`) (ADR 0013)
  - branded ids and Zod schemas for every persisted value in `jobs/`, `candidates/` (including chunk refs like `C04#3`), `guard/`, `redaction/`, `scoring/`, `chunks/`, `vectors/` (`normalize`, `cosineSimilarity`) and `routing/`; `routing/policy.ts` picks the model tier for each LLM task (ADR 0010).
