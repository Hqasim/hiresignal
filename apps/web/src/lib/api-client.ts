import { ProblemSchema } from '@hiresignal/contracts';

/** Anything that can validate an unknown value into `T`; every contracts schema qualifies. */
export interface ResponseSchema<T> {
  parse(input: unknown): T;
}

/**
 * A failed API call, normalized from RFC 9457 problem+json. `detail` is safe to show to users.
 * `status` is 0 and `code` is `NETWORK_ERROR` when the request never reached the API.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly requestId: string | null;

  constructor(init: { status: number; code: string; detail: string; requestId: string | null }) {
    super(init.detail);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.requestId = init.requestId;
  }
}

/** Resolves an API path against the build-time API origin, or the page origin when it's empty. */
export function apiUrl(path: string, baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''): URL {
  return new URL(path, baseUrl === '' ? window.location.origin : baseUrl);
}

/**
 * GETs a JSON resource and validates it with its contracts schema. Every request in the app goes
 * through here (frontend rules), so a contract drift fails loudly instead of rendering bad data.
 *
 * @throws ApiError for network failures, non-2xx responses and responses that break the contract.
 */
export async function apiGet<T>(
  path: string,
  schema: ResponseSchema<T>,
  init?: { signal?: AbortSignal },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      headers: { accept: 'application/json' },
      ...(init?.signal && { signal: init.signal }),
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      detail: 'Could not reach the API. Check your connection and try again.',
      requestId: null,
    });
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(response, body);
  }

  try {
    return schema.parse(body);
  } catch {
    throw new ApiError({
      status: response.status,
      code: 'CONTRACT_MISMATCH',
      detail: 'The API returned data in an unexpected shape.',
      requestId: response.headers.get('x-request-id'),
    });
  }
}

function toApiError(response: Response, body: unknown): ApiError {
  const problem = ProblemSchema.safeParse(body);
  if (problem.success) {
    return new ApiError({
      status: problem.data.status,
      code: problem.data.code,
      detail: problem.data.detail,
      requestId: problem.data.requestId,
    });
  }
  return new ApiError({
    status: response.status,
    code: 'UNEXPECTED_RESPONSE',
    detail: `The API answered with HTTP ${response.status}.`,
    requestId: response.headers.get('x-request-id'),
  });
}
