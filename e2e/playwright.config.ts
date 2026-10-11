import { defineConfig, devices } from '@playwright/test';

// Two modes (ADR 0024):
//
// - Local (default): the SPEC §14 journeys against a replay stack that Playwright starts itself,
//   the API with LLM_MODE=replay and the built web app on `vite preview`, after a fresh replay
//   seed (global-setup.ts). No test can reach Gemini.
// - Smoke: with E2E_BASE_URL set (the deploy workflow sets the production origin), only the
//   read-only `@smoke` journeys run, against that origin. Nothing is started or seeded.

/** A deployed web origin to smoke-test; unset for the full local run. */
const smokeBaseUrl = process.env.E2E_BASE_URL ?? '';
const isSmoke = smokeBaseUrl !== '';
const isCi = process.env.CI === 'true';

/** `vite preview` (apps/web/vite.config.ts), which proxies `/api` to the local API. */
const LOCAL_WEB_ORIGIN = 'http://localhost:4173';
/** The local API's health route (`PORT` 3000, as in `.env.example`). */
const LOCAL_API_HEALTH = 'http://localhost:3000/api/health';

/** Ceiling for the whole run, so a hung server fails the job with a report instead of timing out. */
const GLOBAL_TIMEOUT_MS = 10 * 60_000;
/** Assertion timeout. Production allows for a Lambda cold start plus a Neon wake-up. */
const EXPECT_TIMEOUT_MS = isSmoke ? 20_000 : 5_000;
/** The web server builds the app first, which takes longer than the API's start. */
const WEB_SERVER_TIMEOUT_MS = 180_000;
const API_SERVER_TIMEOUT_MS = 60_000;

export default defineConfig({
  testDir: './tests',
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  // One worker on CI, as Playwright recommends: reproducible runs on a small runner.
  ...(isCi && { workers: 1 }),
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalTimeout: GLOBAL_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
  use: {
    baseURL: isSmoke ? smokeBaseUrl : LOCAL_WEB_ORIGIN,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(isSmoke
    ? { grep: /@smoke/ }
    : {
        globalSetup: './global-setup.ts',
        webServer: [
          {
            name: 'api',
            command: 'npm run start -w @hiresignal/api',
            url: LOCAL_API_HEALTH,
            cwd: '..',
            // Wins over .env: a developer's live-mode .env must never make E2E call Gemini.
            env: { LLM_MODE: 'replay' },
            // Never reuse a running `npm run dev`, which may be in live mode.
            reuseExistingServer: false,
            timeout: API_SERVER_TIMEOUT_MS,
          },
          {
            name: 'web',
            command: 'npm run build -w @hiresignal/web && npm run preview -w @hiresignal/web',
            url: LOCAL_WEB_ORIGIN,
            cwd: '..',
            reuseExistingServer: false,
            timeout: WEB_SERVER_TIMEOUT_MS,
          },
        ],
      }),
});
