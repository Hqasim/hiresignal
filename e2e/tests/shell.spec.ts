import { expect, test } from '@playwright/test';

/** The deployed commit; the deploy workflow sets it, so smoke proves the new build is live. */
const expectedSha = process.env.E2E_GIT_SHA ?? '';
/** The footer shows the short SHA. */
const SHORT_SHA_LENGTH = 7;

test('the footer reports a healthy API', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/about');

  await expect(page.getByRole('status').filter({ hasText: 'API:' })).toHaveText('API: healthy');
});

test('the footer shows the deployed build', { tag: '@smoke' }, async ({ page }) => {
  test.skip(expectedSha === '', 'E2E_GIT_SHA is set only by the deploy workflow');
  await page.goto('/about');

  await expect(page.getByText(`Build ${expectedSha.slice(0, SHORT_SHA_LENGTH)}`)).toBeVisible();
});
