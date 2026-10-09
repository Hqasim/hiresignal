import { z } from 'zod';

/** Media type of every error response (RFC 9457). */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * An RFC 9457 problem details object, extended with a stable `code` and the `requestId`
 * that also appears in the `x-request-id` header and the API logs. A 429 also carries
 * `retryAfter`: whole seconds until the daily quota resets, matching the `Retry-After` header.
 *
 * `detail` is always safe to show to a user; it never contains stack traces or internal state.
 */
export const ProblemSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.int().min(400).max(599),
  detail: z.string(),
  instance: z.string(),
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  requestId: z.string().min(1),
  retryAfter: z.int().nonnegative().optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;
