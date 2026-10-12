# infrastructure

Adapters that implement application ports with real technology.

- **What belongs here:** one folder per technology (`logging/`, `clock/`, `postgres/`, `llm/`, `dataset/`), with adapters named `<Tech><Port>` and built by factories (`createPgChunkRepository`).
- **`postgres/`:** the pool factory, the migrator, one repository per port, and `*-rows.ts` Zod schemas that validate every row (and its JSONB) before mapping snake_case to camelCase. All SQL lives here, always parameterized.
- **`llm/`** (ADRs 0007, 0009, 0010):
  - `gemini/`: the Gemini client and embedder, and the mapping of SDK errors to `LlmCallError`
  - `decorators/`: `withRouting`, `withFallback`, `withRetry`, `withCallLogging`, `withThrottle` (live seeding and evals only) and `withPinnedRoute` (the smoke check, which tests each tier)
  - `replay/`: fixture keys, the fixture store, the recording and replay clients and embedders, and `fixture-first.ts`, which makes record mode replay any request that already has a fixture
- **`dataset/`:** `readDataset` reads `data/jobs/*.md` (YAML front matter via `yaml`) and `data/resumes/cNN-*.md`, hashes each file and decodes `\u{XXXX}` escapes. `retrieval-set.ts`, `injection-set.ts` and `pii-set.ts` load the eval sets in `data/evals/`, all through one JSONL reader (`jsonl.ts`).
- **Allowed imports:** `application/`, `domain/` and SDKs. This is the only layer that may import `@google/genai` or `pg` (dependency-cruiser `sdks-only-in-infrastructure`).
- **Never imports:** `interfaces/`, `main/` or `config/`; tunables arrive as parameters.
- **Entry points:** `postgres/create-pool.ts`, `postgres/pg-*-repository.ts`, `llm/gemini/create-gemini-clients.ts`, `llm/decorators/with-*.ts`, `llm/replay/replay-llm-client.ts`.
