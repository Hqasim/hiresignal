import type { ErrorHandler, NotFoundHandler } from 'hono';

import { AppError, NotFoundError, QuotaExceededError } from '../../application/errors';
import type { Logger } from '../../application/ports/logger';
import type { AppBindings } from './app-bindings';
import { problemResponse } from './problem';

/**
 * The single place errors become HTTP responses (SPEC §7.4).
 *
 * - {@link AppError}s render with their own status, code and safe `detail`; a quota error also
 *   sets `Retry-After`.
 * - Anything else is a bug: it is logged with its stack and rendered as a generic 500,
 *   so internal details never reach the client.
 */
export function createErrorHandler(logger: Logger): ErrorHandler<AppBindings> {
  return (error, c) => {
    if (error instanceof AppError) {
      return problemResponse(c, {
        status: error.httpStatus,
        title: error.title,
        code: error.code,
        detail: error.detail,
        ...(error instanceof QuotaExceededError && { retryAfter: error.retryAfterSeconds }),
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
