# interfaces/http

The HTTP adapter: the Hono app, routes, middleware, DTO mappers and RFC 9457 problem+json.

- **What belongs here:** `app.ts` (`createApp(deps)`: request id → access log → 16 KB body limit → routes), `routes/<resource>.ts` (health, jobs, candidates, ask, ops, docs), `mappers/` (domain → contract DTOs), `middleware/daily-cap.ts` (wraps every LLM route), `middleware/access-log.ts` (one `http.request` line per request), `openapi/` (the OpenAPI 3.1 document built from the contracts, ADR 0021), `validate.ts` (path, query and JSON body input → 400 problem), the single error handler, problem rendering.
- **Allowed imports:** `application/`, `domain/`, `@hiresignal/contracts`. Never `infrastructure/`, `config/` or `main/`: use cases arrive through `createApp`'s deps.
- **Rules:** validate input and shape output with the contracts schemas. Names stay hidden until a candidate is shortlisted (the mappers decide). Never return DB rows or domain objects directly. No CORS middleware; the Function URL owns CORS.
- **Tests:** route contract tests with `app.request()` (`*.test.ts`). `contract-coverage.test.ts` fails when a registered route has no contract cases, and checks that every error is the same problem shape.
