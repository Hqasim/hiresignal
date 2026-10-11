/** Shown wherever a value doesn't exist yet, such as latency on a day with no live calls. */
export const NO_VALUE = '–';

/** One locale for every number and date, so the UI and its tests read the same everywhere. */
const LOCALE = 'en-US';

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });

/**
 * Formats a whole number with grouping.
 *
 * @example
 * formatCount(170447); // '170,447'
 */
export function formatCount(value: number): string {
  return integer.format(value);
}

/**
 * Formats a 0–1 ratio as a percentage, or {@link NO_VALUE} when there is none.
 *
 * @example
 * formatPercent(0.375); // '37.5%'
 */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? NO_VALUE : percent.format(ratio);
}

/**
 * Formats milliseconds, rounded to a whole number, or {@link NO_VALUE} when there are none.
 *
 * @example
 * formatMs(774.6); // '775 ms'
 */
export function formatMs(ms: number | null): string {
  return ms === null ? NO_VALUE : `${integer.format(ms)} ms`;
}

/**
 * Formats an ISO timestamp as a UTC date and time to the minute. The daily cap counts UTC days,
 * so the whole app shows UTC rather than the viewer's zone.
 *
 * @example
 * formatUtcDateTime('2026-10-11T14:05:09.000Z'); // '2026-10-11 14:05 UTC'
 */
export function formatUtcDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toISOString().slice(0, 10)} ${formatUtcTime(iso)}`;
}

/**
 * Formats an ISO timestamp as a UTC time of day.
 *
 * @example
 * formatUtcTime('2026-10-12T00:00:00.000Z'); // '00:00 UTC'
 */
export function formatUtcTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(11, 16)} UTC`;
}

/**
 * Formats a wait in seconds as hours and minutes, rounding up so it never undersells the wait.
 *
 * @example
 * formatWait(4_000); // '1 h 7 min'
 * formatWait(30); // '1 min'
 */
export function formatWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${String(rest)} min`;
  }
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}
