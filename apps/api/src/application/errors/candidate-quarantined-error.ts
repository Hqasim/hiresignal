import { AppError } from './app-error';

/**
 * The candidate's resume was quarantined by the injection guard, so it is never screened or
 * scored (SPEC §9.4). Re-running screening on it is refused rather than silently ignored.
 */
export class CandidateQuarantinedError extends AppError {
  override readonly code = 'CANDIDATE_QUARANTINED';
  override readonly httpStatus = 409;
  override readonly title = 'Candidate Quarantined';
}
