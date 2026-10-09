# main

The composition root and the process entry points.

- **What belongs here:**
  - `container.ts`: reads config, builds adapters, wires them into use cases and the HTTP app; also the migration, smoke, seed and golden-question runners
  - `llm-wiring.ts`: picks the model clients for `LLM_MODE` and composes the decorator chain (SPEC §7.3)
  - `lambda.ts`: AWS Lambda handler (`@hono/aws-lambda`), bundled to `dist/lambda.mjs`
  - `local-server.ts`: local Node server for `npm run dev`
  - `seed-wiring.ts`: `createSeeder`, shared by the seed CLI and its replay integration test
  - `ask-wiring.ts`: `createAskGolden`, shared by the golden-question CLI and the ask integration test; `ask-settings.ts` and `screening-settings.ts` hold the tunables the API and the CLIs share
  - `cli/`: `migrate.ts` (`npm run db:migrate`), `llm-smoke.ts` (`npm run llm:smoke`), `seed.ts` with `seed-args.ts` (`npm run seed`, `seed:record`) and `ask-golden.ts` with `ask-golden-args.ts` (`npm run ask:golden`); the eval runner arrives in Phase 9
- **Allowed imports:** everything. Nothing else may import `main/` (dependency-cruiser `nothing-imports-main`).
- Module-level singletons are allowed here and only here: the container builds one Postgres pool and one Gemini SDK client per process.
