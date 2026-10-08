import type { DbStatus, HealthResponse, LlmMode } from '@hiresignal/contracts';
import { Hono } from 'hono';

import type { DatabaseProbe } from '../../../application/ports/database-probe';
import type { Logger } from '../../../application/ports/logger';
import type { AppBindings } from '../app-bindings';

/** What the health route needs: facts about the running build and a way to reach the database. */
export interface HealthRouteDeps {
  llmMode: LlmMode;
  gitSha: string;
  database: DatabaseProbe;
  logger: Logger;
}

/**
 * `GET /health`: liveness, database reachability, the LLM mode and the git SHA (SPEC §10, §17).
 * The web app calls it on load, which also warms Lambda and wakes Neon from scale-to-zero.
 *
 * A database failure is reported, not thrown: the response stays 200 with `status: 'degraded'`
 * and `db: 'down'`, because the API itself is up and the page can say what's wrong. The error is
 * logged with the request id for diagnosis.
 */
export function healthRoutes(deps: HealthRouteDeps): Hono<AppBindings> {
  return new Hono<AppBindings>().get('/health', async (c) => {
    const db = await checkDatabase(deps, c.get('requestId'));
    const body: HealthResponse = {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      llmMode: deps.llmMode,
      gitSha: deps.gitSha,
    };
    return c.json(body);
  });
}

async function checkDatabase(deps: HealthRouteDeps, requestId: string): Promise<DbStatus> {
  try {
    await deps.database.ping();
    return 'up';
  } catch (error) {
    deps.logger.error('health.db_unreachable', error, { requestId });
    return 'down';
  }
}
