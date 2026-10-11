# e2e

Playwright end-to-end tests with axe accessibility checks (SPEC §14, ADR 0024).

- **Responsibility:** the SPEC §14 user journeys, run in the browser against the real app. Each page also gets an axe scan (WCAG 2.0–2.2 A and AA), which fails on serious or critical violations.
- **Local run** (`npm run test:e2e`, the CI `e2e` job): Playwright starts the API with `LLM_MODE=replay` and the built web app on `vite preview` (:4173). Then [`global-setup.ts`](global-setup.ts) reseeds the database with `npm run seed -- --reset`, because shortlisting has no undo. No test can reach Gemini.
  - Needs `npm run db:up` and `npm run db:migrate`, and a free port 3000: stop `npm run dev` first. A running dev server is never reused, because it may be in live mode.
  - The reseed resets your local shortlists.
- **Smoke run** (`E2E_BASE_URL=<origin> npm run test:smoke -w @hiresignal/e2e`, run by the deploy): only the read-only `@smoke` tests, against that origin. They never shortlist, ask or re-screen, so they make no model call and change no data. `E2E_GIT_SHA` checks that the footer shows the deployed build.
- **Where things are:** [`playwright.config.ts`](playwright.config.ts) holds both modes, `tests/` the journeys, and [`support/journeys.ts`](support/journeys.ts) the navigation and axe helpers.
- **Allowed imports:** `@playwright/test` and `@axe-core/playwright`. Nothing from `apps/*`; dependency-cruiser enforces this with `e2e-not-to-apps`.
- **First run on a machine:** `npx playwright install chromium`.
