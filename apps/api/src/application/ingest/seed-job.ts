import type { JobId } from '../../domain/jobs/job';
import type { CandidateRepository } from '../ports/candidate-repository';
import type { Clock } from '../ports/clock';
import type { JobRepository, NewJob } from '../ports/job-repository';
import type { Logger } from '../ports/logger';
import type { IngestOutcome, IngestResume } from './ingest-resume';
import type { ResumeSource } from './resume-source';

/** Dependencies of {@link createSeedJob}. */
export interface SeedJobDeps {
  jobs: JobRepository;
  candidates: CandidateRepository;
  ingest: IngestResume;
  logger: Logger;
  clock: Clock;
}

/** One job and its resumes to load. */
export interface SeedJobInput {
  job: NewJob;
  resumes: readonly ResumeSource[];
  /** Delete the job's candidates first, so every resume is ingested again (`seed --reset`). */
  reset: boolean;
}

/** What seeding did. */
export interface SeedJobResult {
  jobId: JobId;
  /** Candidates deleted by `reset`; 0 without it. */
  deleted: number;
  /** One per resume, in input order. */
  outcomes: IngestOutcome[];
}

/** Seeds one job. */
export type SeedJob = (input: SeedJobInput) => Promise<SeedJobResult>;

/**
 * Loads a job and its resumes (SPEC §20 Phase 4): upserts the job, optionally deletes its
 * candidates, then ingests the resumes one at a time, in order, so a live run stays under the
 * free tier's per-minute limits and the log reads top to bottom. Without `reset` it is
 * idempotent: stored resumes are skipped before any model call.
 *
 * Logs one `seed.candidate_ingested` event per resume, with the alias, status and counts only.
 *
 * @throws whatever ingestion or the repositories throw. Resumes already stored stay stored, so a
 * re-run picks up where the failure happened.
 *
 * @example
 * const { outcomes } = await seed({ job, resumes, reset: false });
 */
export function createSeedJob(deps: SeedJobDeps): SeedJob {
  return async ({ job, resumes, reset }) => {
    const started = deps.clock.now().getTime();
    const stored = await deps.jobs.upsert(job);
    deps.logger.info('seed.job_upserted', { slug: stored.slug, jobId: stored.id });

    const deleted = reset ? await deps.candidates.deleteByJob(stored.id) : 0;
    if (reset) {
      deps.logger.info('seed.reset', { jobId: stored.id, deleted });
    }

    const outcomes: IngestOutcome[] = [];
    for (const source of resumes) {
      const resumeStarted = deps.clock.now().getTime();
      const outcome = await deps.ingest({ jobId: stored.id, source });
      outcomes.push(outcome);
      deps.logger.info('seed.candidate_ingested', {
        alias: outcome.alias,
        candidateId: outcome.candidateId,
        created: outcome.created,
        guardStatus: outcome.guardStatus,
        signals: outcome.signalIds.length,
        dismissed: outcome.dismissedIds.length,
        classifier: outcome.classifier?.verdict ?? null,
        chunks: outcome.chunkCount,
        durationMs: deps.clock.now().getTime() - resumeStarted,
      });
    }

    deps.logger.info('seed.completed', {
      jobId: stored.id,
      created: outcomes.filter((outcome) => outcome.created).length,
      skipped: outcomes.filter((outcome) => !outcome.created).length,
      quarantined: outcomes.filter((outcome) => outcome.guardStatus === 'quarantined').length,
      durationMs: deps.clock.now().getTime() - started,
    });
    return { jobId: stored.id, deleted, outcomes };
  };
}
