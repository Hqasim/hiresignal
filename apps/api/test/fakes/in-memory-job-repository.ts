import type { JobRepository, NewJob } from '../../src/application/ports/job-repository';
import { type Job, type JobId, JobIdSchema, type JobSlug } from '../../src/domain/jobs/job';

/** {@link JobRepository} fake that keeps jobs in memory and upserts by slug, like Postgres. */
export class InMemoryJobRepository implements JobRepository {
  readonly jobs: Job[] = [];

  upsert(job: NewJob): Promise<Job> {
    const existing = this.jobs.find((stored) => stored.slug === job.slug);
    if (existing !== undefined) {
      Object.assign(existing, job);
      return Promise.resolve(existing);
    }
    const stored: Job = {
      ...job,
      id: JobIdSchema.parse(
        `00000000-0000-4000-9000-${String(this.jobs.length + 1).padStart(12, '0')}`,
      ),
      createdAt: new Date('2026-10-09T12:00:00Z'),
    };
    this.jobs.push(stored);
    return Promise.resolve(stored);
  }

  findById(id: JobId): Promise<Job | null> {
    return Promise.resolve(this.jobs.find((job) => job.id === id) ?? null);
  }

  findBySlug(slug: JobSlug): Promise<Job | null> {
    return Promise.resolve(this.jobs.find((job) => job.slug === slug) ?? null);
  }

  list(options: { limit: number }): Promise<Job[]> {
    return Promise.resolve(this.jobs.slice(0, options.limit));
  }
}
