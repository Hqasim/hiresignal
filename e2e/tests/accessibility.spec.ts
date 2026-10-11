import { expect, type Page, test } from '@playwright/test';

import { expectAccessible, JOB_PATH, openCandidate } from '../support/journeys';

/** Read-only pages, each opened and waited on until its data has rendered. */
const PAGES: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'the job page',
    open: async (page) => {
      await page.goto(JOB_PATH);
      await expect(page.getByRole('region', { name: 'Ranked candidates' })).toBeVisible();
    },
  },
  {
    name: 'a scored candidate (C01)',
    open: async (page) => {
      await openCandidate(page, 'C01');
      await expect(page.getByRole('region', { name: 'Scorecard' })).toBeVisible();
    },
  },
  {
    name: 'the quarantined candidate (C06)',
    open: async (page) => {
      await openCandidate(page, 'C06');
      await expect(page.getByText('Injection (L1, L2)').first()).toBeVisible();
    },
  },
  {
    name: 'Ask',
    open: async (page) => {
      await page.goto(`${JOB_PATH}/ask`);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Ask the talent pool' }),
      ).toBeVisible();
    },
  },
  {
    name: 'Ops',
    open: async (page) => {
      await page.goto('/ops');
      await expect(page.getByRole('region', { name: 'Recent calls' })).toBeVisible();
    },
  },
  {
    name: 'About',
    open: async (page) => {
      await page.goto('/about');
      await expect(page.getByRole('heading', { level: 1, name: 'About HireSignal' })).toBeVisible();
    },
  },
  {
    name: 'an unknown URL',
    open: async (page) => {
      await page.goto('/no-such-page');
      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    },
  },
];

for (const { name, open } of PAGES) {
  test(
    `SPEC §14 journey 6: ${name} has no serious or critical axe violations`,
    { tag: '@smoke' },
    async ({ page }, testInfo) => {
      await open(page);
      await expectAccessible(page, testInfo);
    },
  );
}

// Local only: an answer is a live model call in production.
test('SPEC §14 journey 6: Ask with a cited answer has no serious or critical axe violations', async ({
  page,
}, testInfo) => {
  await page.goto(`${JOB_PATH}/ask`);
  await page
    .getByRole('button', {
      name: 'Who has built retrieval-augmented generation with embeddings and a vector store?',
    })
    .click();
  await expect(page.getByRole('article', { name: 'Answer' })).toBeVisible();

  await expectAccessible(page, testInfo);
});
