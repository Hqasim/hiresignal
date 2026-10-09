import { type Problem, PROBLEM_CONTENT_TYPE } from '@hiresignal/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppBindings } from './app-bindings';

/** The parts of a problem that vary by error; the rest come from the request. */
export interface ProblemInput {
  status: ContentfulStatusCode;
  title: string;
  code: string;
  detail: string;
  /** Seconds until a quota resets; also sent as the `Retry-After` header. */
  retryAfter?: number;
}

/**
 * Renders an RFC 9457 `application/problem+json` response. The `type` is a URN derived from the
 * stable `code`, so clients can branch on either. `requestId` matches the `x-request-id` header.
 */
export function problemResponse(c: Context<AppBindings>, input: ProblemInput): Response {
  const problem: Problem = {
    type: `urn:hiresignal:problem:${input.code.toLowerCase().replaceAll('_', '-')}`,
    title: input.title,
    status: input.status,
    detail: input.detail,
    instance: c.req.path,
    code: input.code,
    requestId: c.get('requestId'),
    ...(input.retryAfter !== undefined && { retryAfter: input.retryAfter }),
  };
  return c.body(JSON.stringify(problem), input.status, {
    'content-type': PROBLEM_CONTENT_TYPE,
    ...(input.retryAfter !== undefined && { 'retry-after': String(input.retryAfter) }),
  });
}
