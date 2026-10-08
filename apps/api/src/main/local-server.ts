import { serve } from '@hono/node-server';

import { createContainer } from './container';

// Local development entry point (`npm run dev`). Node loads `.env` through --env-file-if-exists.
const { app, env, logger, pool } = createContainer(process.env);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info('server.listening', { port: info.port, llmMode: env.LLM_MODE });
});

// Close the server and the pool on Ctrl+C or a `tsx watch` restart, so Postgres connections
// don't pile up across reloads.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close();
    void pool.end().finally(() => process.exit(0));
  });
}
