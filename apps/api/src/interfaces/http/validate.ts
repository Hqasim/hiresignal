import type { z } from 'zod';

import { ValidationError } from '../../application/errors';

/**
 * Parses path or query input with its contract schema. A failure becomes a 400 problem that names
 * the invalid fields without echoing their values.
 *
 * @throws ValidationError when the input doesn't match.
 *
 * @example
 * const { id } = parseRequest(CandidateIdParamsSchema, c.req.param(), 'path');
 */
export function parseRequest<T>(schema: z.ZodType<T>, input: unknown, where: 'path' | 'query'): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.') || where))];
  throw new ValidationError(`Invalid ${where} parameter: ${fields.join(', ')}.`);
}
