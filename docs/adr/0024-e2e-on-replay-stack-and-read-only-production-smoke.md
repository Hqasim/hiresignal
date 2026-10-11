# 0024. E2E on a replay stack, and a read-only smoke against production

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

SPEC §14 asks for Playwright journeys with axe "against the local stack in replay mode", plus a `@smoke` subset that runs against production after each deploy (§15). Four facts shape how:

- **No test may call a model** (CLAUDE.md rule 2). The local API reads `LLM_MODE` from `.env`, and a developer's `.env` may say `live`.
- **The journeys change state.** Shortlisting reveals a name and has no undo. Candidate ids are random UUIDs that change on every reseed.
- **Production is public and runs live.** An Ask or a re-screen there is a real Gemini call against the daily cap and Flash's 20-request free quota. A shortlist there changes what every visitor sees.
- **Production was empty.** `seed-demo` was planned for Phase 10, but a smoke test needs the seeded job to check anything beyond the shell.

## Decision

- **Playwright starts its own replay stack.** In [`playwright.config.ts`](../../e2e/playwright.config.ts), `webServer` starts the API with `LLM_MODE=replay`. That value is set in the environment, so it wins over `.env`, which Node checks. It also builds the web app and serves it on `vite preview`, which proxies `/api` like the dev server. A running dev server is never reused (`reuseExistingServer: false`), because it may be in live mode.
- **Every local run reseeds.** [`global-setup.ts`](../../e2e/global-setup.ts) runs `npm run seed -- --reset` in replay mode, so shortlist state never leaks between runs. Journeys navigate by alias (link text), never by id.
- **One config, two modes.** Set `E2E_BASE_URL` and nothing is started or seeded, and only tests tagged `@smoke` run against that origin.
- **`@smoke` is strictly read-only:**
  - journeys 1–3 (ranked list, citation highlight, quarantined candidate)
  - axe on the job page, C01, C06, Ask (empty), Ops, About and a 404
  - the footer reporting a healthy API and, with `E2E_GIT_SHA`, the deployed build

  Shortlisting, asking and re-screening run only locally. The assertion that C01 and C02 rank first is also local-only, because a visitor's live re-screen can reorder production.

- **`seed-demo.yml` moves into Phase 9.** It reseeds Neon in replay mode with zero Gemini calls, so production holds the same data as CI. The deploy runs `@smoke` after its curl checks. A failure uploads the report.
- **Axe fails on serious or critical violations** (SPEC §2) and attaches every violation to the report. As of 2026-10-12, there are none at any impact level on any page.

## Consequences

- **Positive:**
  - E2E can't reach Gemini, even on a machine whose `.env` is in live mode.
  - Every deploy proves in the browser, against the real Lambda, Neon and Amplify, that the new build is the one serving and that the core journeys still work.
  - The same specs serve both modes, so the smoke subset can't drift from what CI tests.
  - Running the journeys found a real accessibility bug on the first run: the scrolling resume pane couldn't be scrolled by keyboard. It's fixed.
- **Negative:**
  - A local E2E run resets the developer's local shortlists, and it needs port 3000 free.
  - The smoke depends on production being seeded. After a fixture change, run `seed-demo` before or right after the deploy.
  - Shortlisting, Ask and re-screen are never exercised in production by automation. Their production paths are covered by the API's contract tests and by the same code running locally.
  - `seed-demo` shares the deploy's concurrency group. GitHub keeps one waiting run per group, so dispatching it while a deploy waits cancels that deploy (runbook, Reseed production).

## Alternatives considered

- **A separate E2E database,** so a local run doesn't touch the dev data. Rejected for now: the API, seed and migrate CLIs would each need a second connection setting, and the dev data is a replay seed that takes 2 s to rebuild anyway.
- **The full suite against production.** Rejected: Ask and re-screen spend the live quota on every deploy, and shortlisting changes what visitors see.
- **Reusing a running dev server** (`reuseExistingServer: !CI`, Playwright's usual default). Rejected: a dev server in live mode would turn the Ask journey into a live call.
- **A data-free smoke until Phase 10.** Rejected: checking only the shell would prove the deploy serves a page, not that the journeys work.
