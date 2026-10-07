# e2e

Playwright end-to-end tests with axe accessibility checks (SPEC §14).

- **Responsibility:** the user journeys from SPEC §14, against the local stack in replay mode; the `@smoke` subset runs against production after each deploy.
- **Status:** placeholder workspace. Playwright and the journeys arrive in Phase 9.
- **Allowed imports:** `@playwright/test`, `@axe-core/playwright`, `@hiresignal/contracts`. Nothing from `apps/*`.
