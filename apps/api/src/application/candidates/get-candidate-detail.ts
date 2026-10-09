import type { Candidate, CandidateId } from '../../domain/candidates/candidate';
import type { Job } from '../../domain/jobs/job';
import type { Scorecard } from '../../domain/scoring/scorecard';
import { NotFoundError } from '../errors/not-found-error';
import type { CandidateRepository } from '../ports/candidate-repository';
import type { JobRepository } from '../ports/job-repository';
import type { ScorecardRepository } from '../ports/scorecard-repository';

/** A candidate with the job they applied to and their latest scorecard, if any. */
export interface CandidateDetail {
  candidate: Candidate;
  /** The rubric, so scorecard rows can show each requirement's text, kind and weight. */
  job: Job;
  scorecard: Scorecard | null;
}

/** Loads one candidate's detail. */
export type GetCandidateDetail = (id: CandidateId) => Promise<CandidateDetail>;

/** Dependencies of {@link createGetCandidateDetail}. */
export interface GetCandidateDetailDeps {
  candidates: CandidateRepository;
  jobs: JobRepository;
  scorecards: ScorecardRepository;
}

/**
 * `GET /api/candidates/:id` (SPEC §10, §7.2): composed from `findById`, the job and
 * `latestFor`. Quarantined candidates are returned too, with their verdict and no scorecard.
 *
 * @throws NotFoundError if the candidate doesn't exist.
 *
 * @example
 * const { candidate, scorecard } = await getCandidateDetail(id);
 */
export function createGetCandidateDetail(deps: GetCandidateDetailDeps): GetCandidateDetail {
  return async (id) => {
    const candidate = await deps.candidates.findById(id);
    if (candidate === null) {
      throw new NotFoundError(`No candidate with id ${id}.`);
    }
    const [job, scorecard] = await Promise.all([
      deps.jobs.findById(candidate.jobId),
      deps.scorecards.latestFor(candidate.id),
    ]);
    if (job === null) {
      // The foreign key makes this impossible unless the database is corrupt.
      throw new Error(`Candidate ${id} references job ${candidate.jobId}, which does not exist`);
    }
    return { candidate, job, scorecard };
  };
}
