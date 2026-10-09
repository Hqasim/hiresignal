import type { z } from 'zod';

import { ValidationError } from '../../application/errors';

/**
 * Parses path, query or body input with its contract schema. A failure becomes a 400 problem that names
 * the invalid fields without echoing their values.
 *
 * @throws ValidationError when the input doesn't match.
 *
 * @example
 * const { id } = parseRequest(CandidateIdParamsSchema, c.req.param(), 'path');
 */
export function parseRequest<T>(
  schema: z.ZodType<T>,
  input: unknown,
  where: 'path' | 'query' | 'body',
): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.') || where))];
  throw new ValidationError(`Invalid ${where} parameter: ${fields.join(', ')}.`);
}

/**
 * Reads a JSON request body. A body that isn't JSON becomes a 400 problem, never a 500.
 *
 * @throws ValidationError when the body doesn't parse.
 *
 * @example
 * const { question } = parseRequest(AskRequestSchema, await readJsonBody(c.req), 'body');
 */
export async function readJsonBody(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('The request body must be valid JSON.');
  }
}
