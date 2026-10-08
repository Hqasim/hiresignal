# infrastructure

Adapters that implement application ports with real technology.

- **What belongs here:** one folder per technology (`logging/`, `clock/`, `postgres/`; later `llm/`), with adapters named `<Tech><Port>` and built by factories (`createPgChunkRepository`).
- **`postgres/`:** the pool factory, the migrator, one repository per port, and `*-rows.ts` Zod schemas that validate every row (and its JSONB) before mapping snake_case to camelCase. All SQL lives here, always parameterized.
- **Allowed imports:** `application/`, `domain/` and SDKs. This is the only layer that may import `@google/genai` or `pg` (dependency-cruiser `sdks-only-in-infrastructure`).
- **Never imports:** `interfaces/` or `main/`.
- **Entry points:** `logging/json-console-logger.ts`, `clock/system-clock.ts`, `postgres/create-pool.ts`, `postgres/migrator.ts`, `postgres/pg-*-repository.ts`.
