# interfaces/http

The HTTP adapter: the Hono app, routes, middleware, DTO mappers and RFC 9457 problem+json.

- **What belongs here:** `app.ts` (`createApp(deps)`), `routes/<resource>.ts`, the single error handler, problem rendering.
- **Allowed imports:** `application/`, `domain/`, `@hiresignal/contracts`. Never `infrastructure/`, `config/` or `main/`: use cases arrive through `createApp`'s deps.
- **Rules:** validate input and shape output with the contracts schemas. Never return DB rows or domain objects directly. No CORS middleware; the Function URL owns CORS.
- **Tests:** route contract tests with `app.request()` (`*.test.ts`).
