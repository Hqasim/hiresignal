import { expect, type Page, test } from '@playwright/test';

import { candidateLink, JOB_PATH } from '../support/journeys';

/** Reads the ranked table's aliases and scores, top to bottom. */
async function rankedRows(page: Page): Promise<{ alias: string; score: number }[]> {
  const rows = page
    .getByRole('table', { name: /Candidates ranked by score/ })
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });
  const result: { alias: string; score: number }[] = [];
  for (const row of await rows.all()) {
    const cells = row.getByRole('cell');
    // The link reads `C01`, or `Priya Raman (C01)` once shortlisted.
    const alias = /C\d{2}/.exec(await cells.nth(1).innerText())?.[0] ?? '';
    result.push({ alias, score: Number(await cells.nth(2).innerText()) });
  }
  return result;
}

test(
  'SPEC §14 journey 1: the job page ranks the scored candidates and lists the two quarantined ones apart',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(new RegExp(`${JOB_PATH}$`));
    await expect(page.getByRole('region', { name: 'Ranked candidates' })).toBeVisible();

    const rows = await rankedRows(page);
    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.score)).toEqual(
      rows.map((row) => row.score).toSorted((a, b) => b - a),
    );

    const quarantined = page.getByRole('region', { name: 'Quarantined' });
    await expect(quarantined.getByRole('listitem')).toHaveCount(2);
    for (const alias of ['C06', 'C07']) {
      expect(rows.map((row) => row.alias)).not.toContain(alias);
      await expect(
        quarantined.getByRole('listitem').filter({ has: candidateLink(page, alias) }),
      ).toContainText('Not scored');
    }
  },
);

// Local only: production can be re-screened live, which may reorder it.
test('C01 and C02 rank first on the seeded data (SPEC §12)', async ({ page }) => {
  await page.goto(JOB_PATH);
  await expect(page.getByRole('region', { name: 'Ranked candidates' })).toBeVisible();

  const rows = await rankedRows(page);
  expect(rows.slice(0, 2)).toEqual([
    { alias: 'C01', score: 100 },
    { alias: 'C02', score: 100 },
  ]);
});
