# main

The composition root and the process entry points.

- **What belongs here:**
  - `container.ts`: reads config, builds adapters, wires them into use cases and the HTTP app
  - `lambda.ts`: AWS Lambda handler (`@hono/aws-lambda`), bundled to `dist/lambda.mjs`
  - `local-server.ts`: local Node server for `npm run dev`
  - `cli/`: `migrate.ts` (`npm run db:migrate`); seed and eval runners arrive in Phases 4 and 9
- **Allowed imports:** everything. Nothing else may import `main/` (dependency-cruiser `nothing-imports-main`).
- Module-level singletons are allowed here and only here: the container builds one Postgres pool per process.
