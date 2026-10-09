import type { JobDetail, JobSummary } from '@hiresignal/contracts';

import type { Job } from '../../../domain/jobs/job';

/**
 * Maps a job to its list row.
 *
 * @example
 * toJobSummary(job); // { slug: 'senior-fullstack-ai', title: '…', company: '…', requirementCount: 7 }
 */
export function toJobSummary(job: Job): JobSummary {
  return {
    slug: job.slug,
    title: job.title,
    company: job.company,
    requirementCount: job.requirements.length,
  };
}

/**
 * Maps a job to its detail, with the rubric. Ids and timestamps stay internal.
 *
 * @example
 * toJobDetail(job).requirements[0]; // { id: 'R1', text: '…', kind: 'must', weight: 3 }
 */
export function toJobDetail(job: Job): JobDetail {
  return {
    slug: job.slug,
    title: job.title,
    company: job.company,
    description: job.description,
    requirements: job.requirements.map(({ id, text, kind, weight }) => ({
      id,
      text,
      kind,
      weight,
    })),
  };
}
