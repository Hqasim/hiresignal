import { serve } from '@hono/node-server';

import { createContainer } from './container';

// Local development entry point (`npm run dev`). Node loads `.env` through --env-file-if-exists.
const { app, env, logger } = createContainer(process.env);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info('server.listening', { port: info.port, llmMode: env.LLM_MODE });
});
