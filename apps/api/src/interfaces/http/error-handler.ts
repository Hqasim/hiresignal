import type { ErrorHandler, NotFoundHandler } from 'hono';

import {
  AppError,
  LlmUnavailableError,
  NotFoundError,
  QuotaExceededError,
} from '../../application/errors';
import { LlmCallError } from '../../application/llm/llm-call-error';
import type { Logger } from '../../application/ports/logger';
import type { AppBindings } from './app-bindings';
import { problemResponse } from './problem';

/**
 * The single place errors become HTTP responses (SPEC §7.4).
 *
 * - {@link AppError}s render with their own status, code and safe `detail`; a quota error also
 *   sets `Retry-After`. A 5xx one is also logged (`http.request_failed`), because it means a
 *   dependency or a fixture let us down; 4xx ones are the caller's and appear in the access log.
 * - A retryable {@link LlmCallError} (rate limit, outage, timeout) that escaped the decorators
 *   renders as a 503 `LLM_UNAVAILABLE`. The embedder has no fallback tier, so a live
 *   `embedQuery` failure arrives here as one.
 * - Anything else is a bug: it is logged with its stack and rendered as a generic 500,
 *   so internal details never reach the client.
 */
export function createErrorHandler(logger: Logger): ErrorHandler<AppBindings> {
  return (error, c) => {
    const known = asAppError(error);
    if (known !== null) {
      if (known.httpStatus >= 500) {
        logger.error('http.request_failed', error, {
          requestId: c.get('requestId'),
          code: known.code,
        });
      }
      return problemResponse(c, {
        status: known.httpStatus,
        title: known.title,
        code: known.code,
        detail: known.detail,
        ...(known instanceof QuotaExceededError && { retryAfter: known.retryAfterSeconds }),
      });
    }

    logger.error('http.unhandled_error', error, {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
    });
    return problemResponse(c, {
      status: 500,
      title: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      detail: 'Something went wrong on our side. Quote the request id if you report it.',
    });
  };
}

/** The {@link AppError} an error should render as, or `null` for a bug. */
function asAppError(error: Error): AppError | null {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof LlmCallError && error.retryable) {
    return new LlmUnavailableError(
      'The AI model is unavailable right now. Precomputed results still work; try again shortly.',
      { cause: error },
    );
  }
  return null;
}

/** Renders unknown routes as a 404 problem instead of Hono's plain-text default. */
export const notFoundHandler: NotFoundHandler<AppBindings> = (c) => {
  const error = new NotFoundError(`No route matches ${c.req.method} ${c.req.path}.`);
  return problemResponse(c, {
    status: error.httpStatus,
    title: error.title,
    code: error.code,
    detail: error.detail,
  });
};
