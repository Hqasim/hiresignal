---
paths:
  - "apps/api/**"
  - "packages/contracts/**"
  - "db/**"
---

# Backend rules (apps/api, packages/contracts, db)

## Structure

- **Use cases** live in `application/<feature>/` as factory functions, `create<UseCase>(deps)`, whose `deps` are ports. For example: `createScreenCandidate({ llm, embedder, chunks, scorecards, clock })`.
- **Ports** are interfaces in `application/ports/`, named for the capability: `LlmClient`, `Embedder`, `ChunkRepository`, `Clock`. Their TSDoc states behaviour and the errors they throw.
- **Adapters** live in `infrastructure/<tech>/` and are named `<Tech><Port>`: `GeminiLlmClient`, `PgChunkRepository`.
- **LLM cross-cutting concerns** are decorators that implement `LlmClient`: `withRouting`, `withFallback`, `withRetry`, `withCallLogging` (SPEC §7.3). Compose them in `main/container.ts` only.
- **`main/container.ts`** is the only place that reads config and wires adapters. The entry points (`lambda.ts`, `local-server.ts`, `cli/*`) call it. Create clients lazily, outside the Lambda handler, so warm invocations reuse them.

## Domain

- Keep it pure and synchronous where possible:
  - no I/O
  - no `Date.now()`; take a timestamp or `Clock` as input
  - no randomness without an injected source
- **Branded types:** `CandidateId`, `JobId`, `ChunkRef` (`C06#3`), `RedactedText`, `UntrustedText`. Their constructors validate, and only `redact()` produces `RedactedText`.
- Statuses and ratings are string-literal unions. Handle them with exhaustive `switch` statements plus `assertNever`.

## LLM usage

- Every call goes through `LlmClient.generate()` with a `task` from the `LlmTask` union. Never pass a model ID from a use case.
- **Structured output:**
  1. Define a Zod schema.
  2. Convert it with `z.toJSONSchema()` and send it as the response schema.
  3. `schema.parse()` the result.
  4. If parsing fails, retry once with the validation errors appended. If it fails again, raise `LlmOutputInvalidError`.
- **Prompts** are typed builders in `application/prompts/`, each exporting `PROMPT_VERSION`. Untrusted text is wrapped with `spotlight()`.
- The **cacheable screening prefix** has its own builder and a byte-stability test (SPEC §9.2).
- Persist `promptVersion`, model and task with every AI result.

## HTTP

- Routes live in `interfaces/http/routes/<resource>.ts`.
  - Validate params and bodies with the contracts schemas.
  - Map domain objects to DTOs with explicit mapper functions. Never return DB rows or domain objects directly.
- **Errors:** throw typed errors. The single error middleware renders problem+json with `requestId`. Never return a stack trace.
- **Limits:**
  - request body ≤ 16 KB
  - question ≤ 500 chars
  - every list endpoint has a `limit`
- Routes that call the LLM go through the daily-cap middleware.
- No CORS middleware; the Function URL owns CORS.

## Database

- **Migrations:** plain SQL in `db/migrations/NNNN_description.sql`.
  - Forward-only.
  - Idempotent where practical (`if not exists`).
  - Never edit an applied migration; add a new one.
- SQL lives only in `infrastructure/postgres/*-repository.ts`. Always use parameters; never concatenate values into SQL.
- Columns are snake_case and TypeScript is camelCase; map between them in the repository. Parse JSONB read back from the DB with Zod.
- Vectors are `vector(768)`, passed as pgvector literals. The similarity SQL stays in one place, with comments explaining the math.

## Contracts package

- One file per resource, exporting `XxxSchema` and `type Xxx = z.infer<typeof XxxSchema>`.
- Transport shapes only; no domain logic.
- Both api and web import from `@hiresignal/contracts`.
