import type { MiddlewareHandler } from 'hono';

import type { CheckDailyCap } from '../../../application/quota/check-daily-cap';
import type { AppBindings } from '../app-bindings';

/**
 * Wraps every route that calls the LLM (SPEC §10): it runs the daily-cap check before the
 * handler, and a `QuotaExceededError` becomes a 429 problem with `Retry-After` through the one
 * error handler. Routes that only read stored data never pass through it.
 *
 * @example
 * routes.post('/candidates/:id/screen', dailyCap(checkDailyCap), handler);
 */
export function dailyCap(check: CheckDailyCap): MiddlewareHandler<AppBindings> {
  return async (_c, next) => {
    await check();
    await next();
  };
}
