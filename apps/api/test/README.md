# test

Shared test code for the API, and the integration tests. Unit tests live next to the code they test (`src/**/*.test.ts`); this folder holds what they share.

- **`fakes/`:** hand-written implementations of the ports: `FakeLlmClient` and `FakeRoutedLlmClient` with scripted turns, `FakeEmbedder`, `FakeClock`, `RecordingLogger`, and an in-memory version of every repository. Tests use these instead of a mocking library (`.claude/rules/testing.md`).
- **`helpers/`:** builders for domain objects (`builders.ts`, `llm-builders.ts`), `screening-world.ts` (a small job and candidate for screening tests), `test-app.ts` (the Hono app wired to fakes, for route tests), `test-database.ts` (a throwaway, migrated Postgres database per integration test file) and `env-example-models.ts` (the model IDs from `.env.example`, which replay keys depend on).
- **`integration/`:** tests against real Postgres + pgvector (`npm run test:integration`, after `npm run db:up`): migrations, every repository, the hybrid search SQL, and replays of the seed, the golden questions and the evals through the CLIs' own wiring.
- **`fixtures/`:** a Lambda Function URL event for `npm run smoke:bundle`. Recorded model responses are elsewhere, in [`../fixtures/llm/`](../fixtures/llm/).
- **Allowed imports:** anything in `src/`. Nothing in `src/` imports from here.
