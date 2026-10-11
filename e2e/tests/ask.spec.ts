import { expect, test } from '@playwright/test';

import { JOB_PATH } from '../support/journeys';

/** Golden Q01 (SPEC §3): its embedding and answer are recorded, so it replays offline. */
const Q01 = 'Who has built retrieval-augmented generation with embeddings and a vector store?';

// Local only: in production an answer is a live model call against the daily cap.
test('SPEC §14 journey 5: Ask returns a cited answer, and a citation opens its quote', async ({
  page,
}) => {
  await page.goto(`${JOB_PATH}/ask`);

  await page.getByRole('button', { name: Q01 }).click();

  const answer = page.getByRole('article', { name: 'Answer' });
  const evidence = answer.getByRole('link', { name: /^C\d{2} · / });
  await expect(evidence.first()).toBeVisible();
  expect(await evidence.count()).toBeGreaterThan(0);

  await evidence.first().click();

  await expect(page).toHaveURL(/\/candidates\/[0-9a-f-]+\?cite=\d+-\d+$/);
  await expect(page.locator('mark[data-active]').first()).toBeInViewport();
});
