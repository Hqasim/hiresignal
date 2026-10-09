import { z } from 'zod';

/** A half-open character range `[start, end)` in a candidate's redacted resume, for highlighting. */
export const TextSpanSchema = z.object({
  start: z.int().nonnegative(),
  end: z.int().nonnegative(),
});
export type TextSpan = z.infer<typeof TextSpanSchema>;

/**
 * `?limit=` on list endpoints: 1–100, with a per-route default.
 *
 * @example
 * limitQuerySchema(20).parse({ limit: '5' }); // { limit: 5 }
 */
export function limitQuerySchema(defaultLimit: number) {
  return z.object({ limit: z.coerce.number().int().min(1).max(100).default(defaultLimit) });
}
