# @hiresignal/contracts

The HTTP contract between `apps/api` and `apps/web`: Zod schemas and their inferred types.

- **Responsibility:** one source of truth for every request and response shape (SPEC §10). The API validates its output with these schemas in route tests. The web app parses every response with them in `src/lib/api-client.ts`.
- **What belongs here:** one file per resource, exporting `XxxSchema` and `type Xxx = z.infer<typeof XxxSchema>`. Only transport shapes; no domain logic.
- **Allowed imports:** `zod` only (enforced by dependency-cruiser).
- **Entry point:** `src/index.ts`. The package ships TypeScript source with no build step; Vite, esbuild, tsx and Vitest compile it where it's used ([ADR 0003](../../docs/adr/0003-npm-workspaces-and-contracts-package.md)).
