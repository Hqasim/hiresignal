# 0021. OpenAPI document assembled from the contracts

- **Status:** Accepted
- **Date:** 2026-10-11

## Context

SPEC §10 asks for an OpenAPI 3.1 document and a docs UI (a Should, first on the cut list). The API already has a single source of truth for every shape: the Zod schemas in [`@hiresignal/contracts`](../../packages/contracts/src/), which the routes validate input with, the mappers type their output against, and the web app parses responses with. Errors are RFC 9457 problems from one error handler.

Whatever produces the document must:

- describe exactly the shapes the API uses, and stay that way as routes change
- add no dependency, if possible (CLAUDE.md: boring, well-maintained dependencies, each justified)
- leave the five route files and their tests alone; Phase 7 is a 30-minute hardening phase

Zod 4 converts schemas to JSON Schema natively (`z.toJSONSchema`, 2020-12 dialect by default, checked against zod.dev on 2026-10-11). OpenAPI 3.1 uses that same dialect for its schema objects, so the output needs no translation.

## Decision

[`interfaces/http/openapi/openapi-document.ts`](../../apps/api/src/interfaces/http/openapi/openapi-document.ts) builds the document by hand from the contracts:

- **Schemas:** the response and request schemas are added to a local Zod registry with ids. `z.toJSONSchema(registry, { uri })` turns them into `components.schemas`, with `$ref`s between registered schemas. The per-schema `$schema` and `$id` headers are dropped, because the document declares its dialect once.
- **Operations:** a typed table, `OPERATIONS`, lists each route's method, Hono path, tag, summary, request body, response component and error statuses. Path and `limit` parameters come from the contract schemas (`JobSlugParamsSchema`, `CandidateIdParamsSchema`, `limitQuerySchema`).
- **Errors:** each status is a `components.responses` entry with `application/problem+json` and the `Problem` schema; the 429 also documents `Retry-After`. Every operation lists its own statuses plus 500.
- **Drift guard:** a test compares `OPERATIONS` with `app.routes`, so a route can't be added without documenting it. The contract-coverage test also checks that every route has contract cases. Another test resolves every `$ref`.
- **Serving:** [`routes/docs.ts`](../../apps/api/src/interfaces/http/routes/docs.ts) serves `GET /api/openapi.json`, built and serialized once per process (about 25 KB), and `GET /api/docs`, a static page that loads Swagger UI 5.33.0 from jsDelivr. The page pins an exact version, uses Subresource Integrity hashes (taken from the npm tarball and checked identical to jsDelivr's copies), and sets a CSP that allows only those files, its one inline script by hash, and fetches to its own origin.

## Consequences

- **Positive:**
  - The document can't describe a field the API doesn't send: it is generated from the same schemas that validate the traffic.
  - No new dependency, and no change to any route.
  - The docs page needs nothing in the Lambda bundle beyond one HTML string.
- **Negative:**
  - The `OPERATIONS` table repeats each route's method, path and error statuses. The tests catch a missing or extra route, but not an error status that a route gained without the table being updated.
  - The docs page needs jsDelivr when it is viewed. `openapi.json` works without it, and any OpenAPI tool can read that.
  - Zod emits refinements it can't express (for example `.trim()`) as nothing, so the document is slightly looser than the runtime checks.

## Alternatives considered

- **`@hono/zod-openapi`.** Each route is declared with `createRoute()`, so the document and the validation share one declaration, and error statuses can't drift. Rejected for now: it means rewriting all five route files and their validation helper, and it couples the HTTP layer to a second library, for a Should item with a 20-minute budget. If the API grows, it is the natural next step.
- **A hand-written `openapi.yaml`.** No code, any editor. Rejected: it duplicates every schema, and nothing would fail when a contract changed.
- **Cut it** (cut-list item 1) and describe the API in `docs/api.md`. Rejected by Hamzah on 2026-10-11: generating it from the contracts was cheap enough to keep.
- **Serving Swagger UI from the bundle** (`swagger-ui-dist` as a dependency). Rejected: it would add about 1.8 MB to the Lambda zip for a page few people open, and a CDN with SRI gives the same integrity guarantee.
