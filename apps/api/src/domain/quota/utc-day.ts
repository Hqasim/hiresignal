/**
 * The start of the UTC day containing `now`. The daily LLM call cap counts calls since then
 * (SPEC §10), so the quota resets at the same moment for every visitor, whatever their time zone.
 *
 * @example
 * startOfUtcDay(new Date('2026-10-09T15:42:00Z')); // 2026-10-09T00:00:00.000Z
 */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The next UTC midnight after `now`: when an exhausted daily cap resets. `Date.UTC` rolls the
 * day over months and years.
 *
 * @example
 * nextUtcMidnight(new Date('2026-12-31T23:00:00Z')); // 2027-01-01T00:00:00.000Z
 */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
