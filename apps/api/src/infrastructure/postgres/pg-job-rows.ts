import { z } from 'zod';

import { type Job, JobIdSchema, JobSlugSchema, RequirementsSchema } from '../../domain/jobs/job';

/** A `jobs` row as node-postgres returns it: snake_case, JSONB already decoded, timestamps as `Date`. */
export const JobRowSchema = z.object({
  id: JobIdSchema,
  slug: JobSlugSchema,
  title: z.string(),
  company: z.string(),
  description: z.string(),
  requirements: RequirementsSchema,
  created_at: z.date(),
});
/** See {@link JobRowSchema}. */
export type JobRow = z.infer<typeof JobRowSchema>;

/** Every column of `jobs`, in the order {@link JobRowSchema} lists them. */
export const JOB_COLUMNS = 'id, slug, title, company, description, requirements, created_at';

/**
 * Maps a validated row to the domain entity.
 *
 * @example
 * const job = toJob(JobRowSchema.parse(row));
 */
export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    company: row.company,
    description: row.description,
    requirements: row.requirements,
    createdAt: row.created_at,
  };
}
