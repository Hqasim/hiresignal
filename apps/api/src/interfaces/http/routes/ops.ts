import { limitQuerySchema, type LlmCallListResponse, type OpsSummary } from '@hiresignal/contracts';
import { Hono } from 'hono';

import type { GetOpsSummary } from '../../../application/ops/get-ops-summary';
import type { ListRecentCalls } from '../../../application/ops/list-recent-calls';
import type { AppBindings } from '../app-bindings';
import { toLlmCallRow, toOpsSummary } from '../mappers/ops-dto';
import { parseRequest } from '../validate';

/** Default page size of `GET /ops/calls`: one screen of the ops page's table (SPEC §10). */
const CALLS_DEFAULT_LIMIT = 50;

/** The use cases behind the ops routes. */
export interface OpsRoutesDeps {
  getOpsSummary: GetOpsSummary;
  listRecentCalls: ListRecentCalls;
}

/**
 * Ops routes (SPEC §10, §17). Read-only, no model call, so not behind the daily cap. They expose
 * call metadata only; `llm_calls` never holds prompts, resume text or model output.
 *
 * - `GET /ops/summary`: today's calls against the cap, by model, route mix and cache ratio.
 * - `GET /ops/calls?limit=`: the most recent call attempts, newest first.
 */
export function opsRoutes(deps: OpsRoutesDeps): Hono<AppBindings> {
  return new Hono<AppBindings>()
    .get('/ops/summary', async (c) => {
      const body: OpsSummary = toOpsSummary(await deps.getOpsSummary());
      return c.json(body);
    })
    .get('/ops/calls', async (c) => {
      const { limit } = parseRequest(limitQuerySchema(CALLS_DEFAULT_LIMIT), c.req.query(), 'query');
      const body: LlmCallListResponse = {
        calls: (await deps.listRecentCalls({ limit })).map(toLlmCallRow),
      };
      return c.json(body);
    });
}
