import { AskRequestSchema, type AskResponse, JobSlugParamsSchema } from '@hiresignal/contracts';
import { Hono } from 'hono';

import type { AskTalentPool } from '../../../application/ask/ask-talent-pool';
import type { CheckDailyCap } from '../../../application/quota/check-daily-cap';
import { JobSlugSchema } from '../../../domain/jobs/job';
import type { AppBindings } from '../app-bindings';
import { toAskResponse } from '../mappers/ask-dto';
import { dailyCap } from '../middleware/daily-cap';
import { parseRequest, readJsonBody } from '../validate';

/** The use cases behind the ask route. */
export interface AskRoutesDeps {
  askTalentPool: AskTalentPool;
  checkDailyCap: CheckDailyCap;
}

/**
 * `POST /jobs/:slug/ask` (SPEC §10, §9.7): a question across the job's pool, answered with
 * verified citations or "insufficient evidence". Behind the daily cap, because it embeds the
 * question and may call a model. A question that hides instructions gets a 422.
 */
export function askRoutes(deps: AskRoutesDeps): Hono<AppBindings> {
  return new Hono<AppBindings>().post(
    '/jobs/:slug/ask',
    dailyCap(deps.checkDailyCap),
    async (c) => {
      const { slug } = parseRequest(JobSlugParamsSchema, c.req.param(), 'path');
      const { question } = parseRequest(AskRequestSchema, await readJsonBody(c.req), 'body');
      const outcome = await deps.askTalentPool({
        slug: JobSlugSchema.parse(slug),
        question,
        requestId: c.get('requestId'),
      });
      const body: AskResponse = toAskResponse(outcome);
      return c.json(body);
    },
  );
}
