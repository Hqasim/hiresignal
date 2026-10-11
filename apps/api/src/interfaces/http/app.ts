import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';

import { PayloadTooLargeError } from '../../application/errors';
import type { Clock } from '../../application/ports/clock';
import type { Logger } from '../../application/ports/logger';
import type { AppBindings } from './app-bindings';
import { createErrorHandler, notFoundHandler } from './error-handler';
import { accessLog } from './middleware/access-log';
import { askRoutes, type AskRoutesDeps } from './routes/ask';
import { candidateRoutes, type CandidateRoutesDeps } from './routes/candidates';
import { type HealthRouteDeps, healthRoutes } from './routes/health';
import { jobRoutes, type JobRoutesDeps } from './routes/jobs';
import { opsRoutes, type OpsRoutesDeps } from './routes/ops';

/** Everything the HTTP layer needs. `main/container.ts` builds it; tests pass fakes. */
export interface AppDeps {
  logger: Logger;
  /** Times each request for the access log. */
  clock: Clock;
  /** The health route gets the app logger; everything else it needs comes from here. */
  health: Omit<HealthRouteDeps, 'logger'>;
  jobs: JobRoutesDeps;
  candidates: CandidateRoutesDeps;
  ask: AskRoutesDeps;
  ops: OpsRoutesDeps;
}

/** Longest client-supplied `x-request-id` we accept; longer ones are replaced with a fresh UUID. */
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Largest request body accepted, in bytes (SPEC §10: 16 KB). The biggest legitimate body is an
 * ask question of at most 500 characters, so this leaves ample room for JSON and multi-byte
 * text while refusing large payloads before anything parses them (LLM10).
 */
export const MAX_REQUEST_BODY_BYTES = 16 * 1024;

/**
 * Builds the Hono app. Every route lives under `/api`, so the same app serves the Lambda
 * Function URL and the Vite dev proxy. CORS is configured on the Function URL, not here (SPEC §10).
 */
export function createApp(deps: AppDeps): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // Order matters: the request id comes first so every later step can log it, and the access log
  // wraps everything else so it also records requests the error handler answered.
  app.use(requestId({ limitLength: MAX_REQUEST_ID_LENGTH }));
  app.use(accessLog({ logger: deps.logger, clock: deps.clock }));
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_REQUEST_BODY_BYTES,
      // Hono's default throws an HTTPException, which the error handler would treat as a bug.
      onError: () => {
        throw new PayloadTooLargeError(
          `The request body exceeds ${String(MAX_REQUEST_BODY_BYTES)} bytes.`,
        );
      },
    }),
  );
  app.onError(createErrorHandler(deps.logger));
  app.notFound(notFoundHandler);

  app.route('/api', healthRoutes({ ...deps.health, logger: deps.logger }));
  app.route('/api', jobRoutes(deps.jobs));
  app.route('/api', candidateRoutes(deps.candidates));
  app.route('/api', askRoutes(deps.ask));
  app.route('/api', opsRoutes(deps.ops));

  return app;
}
