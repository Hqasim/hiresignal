import type { Job, JobId, JobSlug, Requirement } from '../../domain/jobs/job';

/** A job as the seed CLI loads it from `data/jobs/*.md`, before it has an id. */
export interface NewJob {
  slug: JobSlug;
  title: string;
  company: string;
  description: string;
  requirements: Requirement[];
}

/** Persistence for jobs and their rubrics. */
export interface JobRepository {
  /**
   * Inserts the job, or updates the existing job with the same slug, so reseeding is idempotent.
   * Returns the stored job.
   */
  upsert(job: NewJob): Promise<Job>;
  /** Returns the job with this id, or `null` if there is none. */
  findById(id: JobId): Promise<Job | null>;
  /** Returns the job with this slug, or `null` if there is none. */
  findBySlug(slug: JobSlug): Promise<Job | null>;
  /** Returns up to `limit` jobs, oldest first. */
  list(options: { limit: number }): Promise<Job[]>;
}
