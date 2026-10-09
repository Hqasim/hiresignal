import {
  type CandidateDetail,
  CandidateIdParamsSchema,
  type ScreenResponse,
} from '@hiresignal/contracts';
import { Hono } from 'hono';

import type { GetCandidateDetail } from '../../../application/candidates/get-candidate-detail';
import type { ShortlistCandidate } from '../../../application/candidates/shortlist-candidate';
import type { CheckDailyCap } from '../../../application/quota/check-daily-cap';
import type { ScreenCandidate } from '../../../application/screening/screen-candidate';
import { CandidateIdSchema } from '../../../domain/candidates/candidate';
import type { AppBindings } from '../app-bindings';
import { toCandidateDetail } from '../mappers/candidate-dto';
import { toScorecardDto } from '../mappers/scorecard-dto';
import { dailyCap } from '../middleware/daily-cap';
import { parseRequest } from '../validate';

/** The use cases behind the candidate routes. */
export interface CandidateRoutesDeps {
  getCandidateDetail: GetCandidateDetail;
  shortlistCandidate: ShortlistCandidate;
  screenCandidate: ScreenCandidate;
  checkDailyCap: CheckDailyCap;
}

/**
 * Candidate routes (SPEC §10):
 *
 * - `GET /candidates/:id`: redacted resume, redaction summary, guard verdict with spans, and the
 *   latest scorecard with citation spans and trace. No model call.
 * - `POST /candidates/:id/shortlist`: the human decision; reveals the name. Idempotent.
 * - `POST /candidates/:id/screen`: re-runs screening live, behind the daily cap. A quarantined
 *   candidate gets a 409.
 */
export function candidateRoutes(deps: CandidateRoutesDeps): Hono<AppBindings> {
  return new Hono<AppBindings>()
    .get('/candidates/:id', async (c) => {
      const id = candidateId(c.req.param());
      const body: CandidateDetail = toCandidateDetail(await deps.getCandidateDetail(id));
      return c.json(body);
    })
    .post('/candidates/:id/shortlist', async (c) => {
      const id = candidateId(c.req.param());
      const body: CandidateDetail = toCandidateDetail(await deps.shortlistCandidate(id));
      return c.json(body);
    })
    .post('/candidates/:id/screen', dailyCap(deps.checkDailyCap), async (c) => {
      const id = candidateId(c.req.param());
      const { scorecard, job } = await deps.screenCandidate({
        candidateId: id,
        requestId: c.get('requestId'),
      });
      const body: ScreenResponse = { scorecard: toScorecardDto(scorecard, job) };
      return c.json(body);
    });
}

function candidateId(params: Record<string, string>) {
  return CandidateIdSchema.parse(parseRequest(CandidateIdParamsSchema, params, 'path').id);
}
