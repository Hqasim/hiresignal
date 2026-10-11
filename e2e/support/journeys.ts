import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** The demo's one job (SPEC §12). */
export const JOB_PATH = '/jobs/senior-fullstack-ai';

/** WCAG 2.0, 2.1 and 2.2, levels A and AA: the bar SPEC §11 sets. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** Impacts that fail a journey (SPEC §2: no serious or critical violations). */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/**
 * The link to a candidate, whether its name is hidden (`C08`) or revealed after shortlisting
 * (`Liam O'Connor (C08)`). Ids change on every reseed, so journeys navigate by alias.
 */
export function candidateLink(page: Page, alias: string): Locator {
  return page.getByRole('link', { name: new RegExp(`^(${alias}|.+ \\(${alias}\\))$`) });
}

/** Opens the job page, then the candidate with `alias`, and waits for its heading. */
export async function openCandidate(page: Page, alias: string): Promise<void> {
  await page.goto(JOB_PATH);
  await candidateLink(page, alias).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(alias) })).toBeVisible();
}

/**
 * Runs axe on the page as it is now, attaches every violation to the report, and fails on a
 * serious or critical one. Moderate and minor ones are recorded as annotations for review.
 */
export async function expectAccessible(page: Page, testInfo: TestInfo): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  await testInfo.attach('axe-violations.json', {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
  const fingerprint = (violation: (typeof violations)[number]) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  });
  for (const violation of violations.filter((v) => !BLOCKING_IMPACTS.has(v.impact ?? ''))) {
    testInfo.annotations.push({
      type: 'axe',
      description: `${violation.id} (${violation.impact ?? 'unknown'})`,
    });
  }
  expect(violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? '')).map(fingerprint)).toEqual(
    [],
  );
}
