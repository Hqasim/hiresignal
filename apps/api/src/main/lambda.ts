import { handle } from '@hono/aws-lambda';

import { createContainer } from './container';

// Built once per cold start, outside the handler, so warm invocations reuse it.
const { app } = createContainer(process.env);

/**
 * AWS Lambda entry point behind a Function URL (payload format 2.0).
 * `nodejs24.x` supports only async handlers; `handle` returns one.
 */
export const handler = handle(app);
