import type { Hono } from 'hono';

import type { Logger } from '../application/ports/logger';
import { type Env, parseEnv } from '../config/env';
import { systemClock } from '../infrastructure/clock/system-clock';
import { createJsonConsoleLogger } from '../infrastructure/logging/json-console-logger';
import { createApp } from '../interfaces/http/app';
import type { AppBindings } from '../interfaces/http/app-bindings';

/** The wired application, shared by every entry point. */
export interface Container {
  env: Env;
  logger: Logger;
  app: Hono<AppBindings>;
}

/**
 * Composition root: the only place that reads configuration and wires adapters to ports.
 * Entry points call it once at module load, so warm Lambda invocations reuse every client.
 *
 * @throws Error if the environment is invalid, so a bad deploy fails at cold start.
 */
export function createContainer(source: Readonly<Record<string, string | undefined>>): Container {
  const env = parseEnv(source);
  const logger = createJsonConsoleLogger({ clock: systemClock });
  const app = createApp({
    logger,
    health: { llmMode: env.LLM_MODE, gitSha: env.GIT_SHA },
  });
  return { env, logger, app };
}
