/**
 * `part / whole`, or `null` when `whole` is 0: a rate over nothing is undefined, and reporting it
 * as 0 or 1 would let an empty dataset pass or fail a gate silently.
 *
 * @example
 * ratio(3, 4); // 0.75
 * ratio(0, 0); // null
 */
export function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}
