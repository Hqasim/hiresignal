import type { Job, JobSlug } from '../../domain/jobs/job';
import { NotFoundError } from '../errors/not-found-error';
import type { JobRepository } from '../ports/job-repository';

/** Returns one job and its rubric. */
export type GetJob = (slug: JobSlug) => Promise<Job>;

/**
 * `GET /api/jobs/:slug` (SPEC §10).
 *
 * @throws NotFoundError if no job has the slug.
 *
 * @example
 * const job = await createGetJob({ jobs })(slug);
 */
export function createGetJob(deps: { jobs: JobRepository }): GetJob {
  return async (slug) => {
    const job = await deps.jobs.findBySlug(slug);
    if (job === null) {
      throw new NotFoundError(`No job with slug ${slug}.`);
    }
    return job;
  };
}
