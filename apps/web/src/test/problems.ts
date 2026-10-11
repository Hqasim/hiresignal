import type { Problem } from '@hiresignal/contracts';
import { HttpResponse } from 'msw/http';

/** A problem+json body for tests, with the fields every API error carries. */
export function aProblem(overrides: Partial<Problem> & Pick<Problem, 'status' | 'code'>): Problem {
  return {
    type: `urn:hiresignal:problem:${overrides.code.toLowerCase().replaceAll('_', '-')}`,
    title: 'Request failed',
    detail: 'Something went wrong.',
    instance: '/api/test',
    requestId: 'req-test',
    ...overrides,
  };
}

/** An MSW response carrying `problem` with its status and media type. */
export function problemResponse(problem: Problem): HttpResponse<Problem> {
  return HttpResponse.json(problem, {
    status: problem.status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

/** The daily cap's 429, as the API sends it (SPEC §10). */
export const QUOTA_PROBLEM = aProblem({
  status: 429,
  code: 'QUOTA_EXCEEDED',
  title: 'Too Many Requests',
  detail: 'The daily model-call quota is used up. It resets at midnight UTC.',
  retryAfter: 3600,
});
