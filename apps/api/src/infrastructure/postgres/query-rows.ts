import type { z } from 'zod';

import type { Queryable } from './create-pool';

/**
 * Runs a parameterized query and validates every row with `schema`, so a column that drifts from
 * what the code expects fails loudly here instead of surfacing as `undefined` somewhere else.
 *
 * Values are always passed as parameters (`$1`, `$2`, …), never concatenated into `text`.
 *
 * @example
 * const jobs = await queryRows(pool, 'select * from jobs where slug = $1', [slug], JobRowSchema);
 */
export async function queryRows<T>(
  db: Queryable,
  text: string,
  values: readonly unknown[],
  schema: z.ZodType<T>,
): Promise<T[]> {
  const result = await db.query<Record<string, unknown>>(text, [...values]);
  return result.rows.map((row) => schema.parse(row));
}
