import type { JobRepository, NewJob } from '../../application/ports/job-repository';
import type { Job, JobSlug } from '../../domain/jobs/job';
import type { Queryable } from './create-pool';
import { JOB_COLUMNS, JobRowSchema, toJob } from './pg-job-rows';
import { queryRows } from './query-rows';

/**
 * {@link JobRepository} on Postgres.
 *
 * @example
 * const jobs = createPgJobRepository(pool);
 * await jobs.upsert(job);
 */
export function createPgJobRepository(db: Queryable): JobRepository {
  return {
    async upsert(job: NewJob): Promise<Job> {
      // JSONB is passed as text: node-postgres would turn a JS array into a Postgres array.
      const [row] = await queryRows(
        db,
        `insert into jobs (slug, title, company, description, requirements)
         values ($1, $2, $3, $4, $5::jsonb)
         on conflict (slug) do update set
           title = excluded.title,
           company = excluded.company,
           description = excluded.description,
           requirements = excluded.requirements
         returning ${JOB_COLUMNS}`,
        [job.slug, job.title, job.company, job.description, JSON.stringify(job.requirements)],
        JobRowSchema,
      );
      if (row === undefined) {
        throw new Error('Upserting a job returned no row');
      }
      return toJob(row);
    },

    async findBySlug(slug: JobSlug): Promise<Job | null> {
      const [row] = await queryRows(
        db,
        `select ${JOB_COLUMNS} from jobs where slug = $1`,
        [slug],
        JobRowSchema,
      );
      return row === undefined ? null : toJob(row);
    },

    async list(options: { limit: number }): Promise<Job[]> {
      const rows = await queryRows(
        db,
        `select ${JOB_COLUMNS} from jobs order by created_at, slug limit $1`,
        [options.limit],
        JobRowSchema,
      );
      return rows.map(toJob);
    },
  };
}
