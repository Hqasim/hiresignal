import type { Job } from '../../domain/jobs/job';
import type { JobRepository } from '../ports/job-repository';

/** Lists up to `limit` jobs, oldest first. */
export type ListJobs = (options: { limit: number }) => Promise<Job[]>;

/**
 * `GET /api/jobs` (SPEC §10).
 *
 * @example
 * const jobs = await createListJobs({ jobs: repository })({ limit: 20 });
 */
export function createListJobs(deps: { jobs: JobRepository }): ListJobs {
  return (options) => deps.jobs.list(options);
}
