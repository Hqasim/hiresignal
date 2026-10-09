import type { CandidateId } from '../../domain/candidates/candidate';
import { NotFoundError } from '../errors/not-found-error';
import type { CandidateRepository } from '../ports/candidate-repository';
import type { Clock } from '../ports/clock';
import type { CandidateDetail, GetCandidateDetail } from './get-candidate-detail';

/** Shortlists one candidate and returns their updated detail. */
export type ShortlistCandidate = (id: CandidateId) => Promise<CandidateDetail>;

/** Dependencies of {@link createShortlistCandidate}. */
export interface ShortlistCandidateDeps {
  candidates: CandidateRepository;
  getDetail: GetCandidateDetail;
  clock: Clock;
}

/**
 * `POST /api/candidates/:id/shortlist` (SPEC §10, §9.6 human checkpoint): the one decision in the
 * app, made only by a person. It reveals the synthetic display name. Idempotent: shortlisting
 * again keeps the first time.
 *
 * @throws NotFoundError if the candidate doesn't exist.
 *
 * @example
 * const { candidate } = await shortlist(id); // candidate.shortlistedAt is set
 */
export function createShortlistCandidate(deps: ShortlistCandidateDeps): ShortlistCandidate {
  return async (id) => {
    const updated = await deps.candidates.shortlist(id, deps.clock.now());
    if (updated === null) {
      throw new NotFoundError(`No candidate with id ${id}.`);
    }
    return deps.getDetail(id);
  };
}
