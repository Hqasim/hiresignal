import type { JobSlug } from '../../domain/jobs/job';
import type { GetJob } from '../jobs/get-job';
import type { CandidateRepository, RankedCandidate } from '../ports/candidate-repository';

/** Lists a job's candidates, ranked. */
export type ListCandidates = (input: {
  slug: JobSlug;
  limit: number;
}) => Promise<RankedCandidate[]>;

/**
 * `GET /api/jobs/:slug/candidates` (SPEC §10): latest score first, unscored after scored,
 * quarantined last. Rows carry no resume text.
 *
 * @throws NotFoundError if no job has the slug.
 *
 * @example
 * const rows = await listCandidates({ slug, limit: 50 });
 */
export function createListCandidates(deps: {
  getJob: GetJob;
  candidates: CandidateRepository;
}): ListCandidates {
  return async ({ slug, limit }) => {
    const job = await deps.getJob(slug);
    return deps.candidates.listRanked(job.id, { limit });
  };
}
