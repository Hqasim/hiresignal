import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';

import type { Clock } from '../../../application/ports/clock';
import type { Logger } from '../../../application/ports/logger';
import type { AppBindings } from '../app-bindings';

/**
 * Logs one `http.request` line per request (SPEC §17): request id, method, the matched route
 * pattern, status and duration. It runs outside every other middleware, so it also sees the
 * status of a request the error handler answered.
 *
 * `route` is the registered pattern (`/api/candidates/:id`), never the raw path, so neither ids nor
 * whatever a caller typed into an unknown URL reach the logs. Bodies and queries are never read.
 *
 * @example
 * app.use(accessLog({ logger, clock }));
 * // {"event":"http.request","requestId":"…","method":"GET","route":"/api/jobs","status":200,"durationMs":12}
 */
export function accessLog(deps: { logger: Logger; clock: Clock }): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const started = deps.clock.now().getTime();
    await next();
    deps.logger.info('http.request', {
      requestId: c.get('requestId'),
      method: c.req.method,
      // The last matched route is the handler's own pattern (an unknown URL ends on `/api/*`).
      route: routePath(c, -1),
      status: c.res.status,
      durationMs: deps.clock.now().getTime() - started,
    });
  };
}
