import { ProblemSchema } from '@hiresignal/contracts';

/** Anything that can validate an unknown value into `T`; every contracts schema qualifies. */
export interface ResponseSchema<T> {
  parse(input: unknown): T;
}

/** Problem code of a 429 from the daily-cap middleware (SPEC §10). */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

/**
 * A failed API call, normalized from RFC 9457 problem+json. `detail` is safe to show to users.
 * `status` is 0 and `code` is `NETWORK_ERROR` when the request never reached the API.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly requestId: string | null;
  /** Seconds until the daily quota resets; set only on a 429. */
  readonly retryAfter: number | null;

  constructor(init: {
    status: number;
    code: string;
    detail: string;
    requestId: string | null;
    retryAfter?: number | null;
  }) {
    super(init.detail);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter ?? null;
  }
}

/** Whether `error` is the daily cap refusing a model call, so the UI shows the quota banner. */
export function isQuotaExceeded(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === QUOTA_EXCEEDED_CODE;
}

/** Resolves an API path against the build-time API origin, or the page origin when it's empty. */
export function apiUrl(path: string, baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''): URL {
  return new URL(path, baseUrl === '' ? window.location.origin : baseUrl);
}

/**
 * GETs a JSON resource and validates it with its contracts schema. Every request in the app goes
 * through this module (frontend rules), so a contract drift fails loudly instead of rendering bad
 * data.
 *
 * @throws ApiError for network failures, non-2xx responses and responses that break the contract.
 */
export function apiGet<T>(
  path: string,
  schema: ResponseSchema<T>,
  init?: { signal?: AbortSignal },
): Promise<T> {
  return request(path, schema, {
    headers: { accept: 'application/json' },
    ...(init?.signal && { signal: init.signal }),
  });
}

/**
 * POSTs a JSON body (or none) and validates the response with its contracts schema.
 *
 * @throws ApiError for network failures, non-2xx responses and responses that break the contract.
 */
export function apiPost<T>(path: string, schema: ResponseSchema<T>, body?: unknown): Promise<T> {
  return request(path, schema, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function request<T>(path: string, schema: ResponseSchema<T>, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), init);
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
      retryAfter: problem.data.retryAfter ?? null,
    });
  }
  return new ApiError({
    status: response.status,
    code: 'UNEXPECTED_RESPONSE',
    detail: `The API answered with HTTP ${response.status}.`,
    requestId: response.headers.get('x-request-id'),
  });
}
