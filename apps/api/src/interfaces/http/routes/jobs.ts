import {
  type CandidateListResponse,
  type JobDetail,
  type JobListResponse,
  JobSlugParamsSchema,
  limitQuerySchema,
} from '@hiresignal/contracts';
import { Hono } from 'hono';

import type { ListCandidates } from '../../../application/candidates/list-candidates';
import type { GetJob } from '../../../application/jobs/get-job';
import type { ListJobs } from '../../../application/jobs/list-jobs';
import { JobSlugSchema } from '../../../domain/jobs/job';
import type { AppBindings } from '../app-bindings';
import { toCandidateSummary } from '../mappers/candidate-dto';
import { toJobDetail, toJobSummary } from '../mappers/job-dto';
import { parseRequest } from '../validate';

/** Default page sizes: every job, and every candidate of a demo-sized pool. */
const JOBS_DEFAULT_LIMIT = 20;
const CANDIDATES_DEFAULT_LIMIT = 50;

/** The use cases behind the job routes. */
export interface JobRoutesDeps {
  listJobs: ListJobs;
  getJob: GetJob;
  listCandidates: ListCandidates;
}

/**
 * Read-only job routes (SPEC §10). None calls a model.
 *
 * - `GET /jobs?limit=`: jobs, oldest first.
 * - `GET /jobs/:slug`: the job and its rubric.
 * - `GET /jobs/:slug/candidates?limit=`: ranked candidates, quarantined last, names hidden until
 *   shortlisted.
 */
export function jobRoutes(deps: JobRoutesDeps): Hono<AppBindings> {
  return new Hono<AppBindings>()
    .get('/jobs', async (c) => {
      const { limit } = parseRequest(limitQuerySchema(JOBS_DEFAULT_LIMIT), c.req.query(), 'query');
      const body: JobListResponse = { jobs: (await deps.listJobs({ limit })).map(toJobSummary) };
      return c.json(body);
    })
    .get('/jobs/:slug', async (c) => {
      const { slug } = parseRequest(JobSlugParamsSchema, c.req.param(), 'path');
      const body: JobDetail = toJobDetail(await deps.getJob(JobSlugSchema.parse(slug)));
      return c.json(body);
    })
    .get('/jobs/:slug/candidates', async (c) => {
      const { slug } = parseRequest(JobSlugParamsSchema, c.req.param(), 'path');
      const { limit } = parseRequest(
        limitQuerySchema(CANDIDATES_DEFAULT_LIMIT),
        c.req.query(),
        'query',
      );
      const rows = await deps.listCandidates({ slug: JobSlugSchema.parse(slug), limit });
      const body: CandidateListResponse = { candidates: rows.map(toCandidateSummary) };
      return c.json(body);
    });
}
