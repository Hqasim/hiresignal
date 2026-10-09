# application

Use cases and the ports they depend on.

- **What belongs here:**
  - use cases as factory functions (`create<UseCase>(deps)`), such as `smoke/check-llm-platform.ts`, `guard/classify-injection.ts` (the L3 classifier), `ingest/ingest-resume.ts` (the SPEC §9.5 pipeline), `ingest/seed-job.ts` (load a job and its resumes), `screening/screen-candidate.ts` (the SPEC §9.6 agent, synthesis, verification and scoring), `screening/screen-pool.ts` (precomputed scorecards for seeding), `quota/check-daily-cap.ts`, and the read and shortlist use cases in `jobs/` and `candidates/`
  - ports (`ports/`): interfaces for everything outside the process (`LlmClient`, `RoutedLlmClient`, `Embedder`, repositories, clock, logger)
  - typed errors (`errors/`)
  - LLM helpers (`llm/`): `generateStructured` (Zod schema → JSON Schema → parse, one repair turn), `LlmCallError`, `withCallTally`, JSON types
  - prompt builders (`prompts/`), each exporting `PROMPT_VERSION`, and `spotlight()`, which wraps every piece of untrusted text; `screening-prefix.ts` is the byte-stable, cacheable system instruction shared by every screening call (ADR 0011)
- **Allowed imports:** `domain/` and `zod` (dependency-cruiser `application-depends-on-domain-only`). Tunables from `config/` arrive as parameters.
- **Tests:** with hand-written fakes from `test/fakes/`; coverage gate ≥ 80%.
- **Entry points:** `ports/llm-client.ts`, `llm/generate-structured.ts`, `ingest/ingest-resume.ts`, `screening/screen-candidate.ts`, `errors/index.ts` (`AppError` and subclasses).
