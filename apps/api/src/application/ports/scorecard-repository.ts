import type { CandidateId } from '../../domain/candidates/candidate';
import type { Scorecard } from '../../domain/scoring/scorecard';

/** A verified scorecard ready to store. `createdAt` comes from the injected `Clock`. */
export type NewScorecard = Omit<Scorecard, 'id'>;

/** Persistence for screening results. Scorecards are append-only: re-screening adds one. */
export interface ScorecardRepository {
  /** Stores the scorecard and returns it with its id. */
  save(scorecard: NewScorecard): Promise<Scorecard>;
  /** Returns the candidate's newest scorecard, or `null` if it was never screened. */
  latestFor(candidateId: CandidateId): Promise<Scorecard | null>;
}
