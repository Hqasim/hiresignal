import type { RequestIdVariables } from 'hono/request-id';

/** Per-request variables every route and middleware can read with `c.get(...)`. */
export interface AppBindings {
  Variables: RequestIdVariables;
}
