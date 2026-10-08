import { Hono } from 'hono';
import { requestId } from 'hono/request-id';

import type { Logger } from '../../application/ports/logger';
import type { AppBindings } from './app-bindings';
import { createErrorHandler, notFoundHandler } from './error-handler';
import { type HealthRouteDeps, healthRoutes } from './routes/health';

/** Everything the HTTP layer needs. `main/container.ts` builds it; tests pass fakes. */
export interface AppDeps {
  logger: Logger;
  /** The health route gets the app logger; everything else it needs comes from here. */
  health: Omit<HealthRouteDeps, 'logger'>;
}

/** Longest client-supplied `x-request-id` we accept; longer ones are replaced with a fresh UUID. */
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Builds the Hono app. Every route lives under `/api`, so the same app serves the Lambda
 * Function URL and the Vite dev proxy. CORS is configured on the Function URL, not here (SPEC §10).
 */
export function createApp(deps: AppDeps): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.use(requestId({ limitLength: MAX_REQUEST_ID_LENGTH }));
  app.onError(createErrorHandler(deps.logger));
  app.notFound(notFoundHandler);

  app.route('/api', healthRoutes({ ...deps.health, logger: deps.logger }));

  return app;
}
