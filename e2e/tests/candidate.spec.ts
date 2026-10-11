import { expect, test } from '@playwright/test';

import { candidateLink, JOB_PATH, openCandidate } from '../support/journeys';

// The resume view marks the picked citation's segments with `data-active` (ADR 0022). A `<mark>`
// has no role Playwright can query, so this state attribute is the hook.
const ACTIVE_QUOTE = 'mark[data-active]';
/** Screen-reader text at the start of the active quote. */
const QUOTE_PREFIX = 'Cited quote: ';

test(
  'SPEC §14 journey 2: clicking a citation highlights its quote in the resume',
  { tag: '@smoke' },
  async ({ page }) => {
    await openCandidate(page, 'C01');
    const chip = page.getByRole('list', { name: 'Citations for R1' }).getByRole('button').first();
    // The chip's title holds the full quote; its accessible name is cut at 72 characters.
    const quote = (await chip.getAttribute('title')) ?? '';
    expect(quote.length).toBeGreaterThan(0);

    await chip.click();

    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    const active = page.locator(ACTIVE_QUOTE);
    await expect(active.first()).toBeFocused();
    await expect(active.first()).toBeInViewport();
    const highlighted = (await active.allTextContents()).join('');
    expect(highlighted.replace(QUOTE_PREFIX, '')).toBe(quote);
  },
);

test(
  'SPEC §14 journey 3: the quarantined candidate shows its injection span and no score',
  { tag: '@smoke' },
  async ({ page }) => {
    await openCandidate(page, 'C06');

    await expect(page.getByText('Injection (L1, L2)').first()).toBeVisible();
    await expect(page.getByText('No score: quarantined resumes are never scored.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-run screening' })).toHaveCount(0);
  },
);

// Local only: shortlisting writes to the database, and the next local run reseeds.
test('SPEC §14 journey 4: shortlisting reveals the name', async ({ page }) => {
  await openCandidate(page, 'C08');

  await page.getByRole('button', { name: 'Shortlist and reveal name' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Liam O'Connor (C08)");
  await expect(page.getByRole('status').filter({ hasText: 'Name revealed' })).toHaveText(
    "Shortlisted. Name revealed: Liam O'Connor",
  );
  await page.goto(JOB_PATH);
  await expect(candidateLink(page, 'C08')).toHaveText("Liam O'Connor (C08)");
});
