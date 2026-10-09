# interfaces/http

The HTTP adapter: the Hono app, routes, middleware, DTO mappers and RFC 9457 problem+json.

- **What belongs here:** `app.ts` (`createApp(deps)`), `routes/<resource>.ts` (health, jobs, candidates, ask), `mappers/` (domain → contract DTOs), `middleware/daily-cap.ts` (wraps every LLM route), `validate.ts` (path, query and JSON body input → 400 problem), the single error handler, problem rendering.
- **Allowed imports:** `application/`, `domain/`, `@hiresignal/contracts`. Never `infrastructure/`, `config/` or `main/`: use cases arrive through `createApp`'s deps.
- **Rules:** validate input and shape output with the contracts schemas. Names stay hidden until a candidate is shortlisted (the mappers decide). Never return DB rows or domain objects directly. No CORS middleware; the Function URL owns CORS.
- **Tests:** route contract tests with `app.request()` (`*.test.ts`).
