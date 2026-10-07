import type { HealthResponse, LlmMode } from '@hiresignal/contracts';
import { Hono } from 'hono';

import type { AppBindings } from '../app-bindings';

/** What the health route needs to know about the running build. */
export interface HealthRouteDeps {
  llmMode: LlmMode;
  gitSha: string;
}

/**
 * `GET /health`: liveness, the LLM mode and the git SHA (SPEC §10, §17).
 * The web app calls it on load, which also warms Lambda (and, from Phase 1, Neon).
 * The database check is `unchecked` until Phase 1 adds a real ping.
 */
export function healthRoutes(deps: HealthRouteDeps): Hono<AppBindings> {
  return new Hono<AppBindings>().get('/health', (c) => {
    const body: HealthResponse = {
      status: 'ok',
      db: 'unchecked',
      llmMode: deps.llmMode,
      gitSha: deps.gitSha,
    };
    return c.json(body);
  });
}
