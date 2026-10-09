import type {
  NewScorecard,
  ScorecardRepository,
} from '../../src/application/ports/scorecard-repository';
import type { CandidateId } from '../../src/domain/candidates/candidate';
import { type Scorecard, ScorecardIdSchema } from '../../src/domain/scoring/scorecard';

/**
 * {@link ScorecardRepository} fake: append-only, like Postgres, with deterministic ids. The latest
 * scorecard is the newest by `createdAt`, and the later save on a tie.
 */
export class InMemoryScorecardRepository implements ScorecardRepository {
  readonly scorecards: Scorecard[] = [];

  save(scorecard: NewScorecard): Promise<Scorecard> {
    const stored: Scorecard = {
      ...scorecard,
      id: ScorecardIdSchema.parse(
        `00000000-0000-4000-a000-${String(this.scorecards.length + 1).padStart(12, '0')}`,
      ),
    };
    this.scorecards.push(stored);
    return Promise.resolve(stored);
  }

  latestFor(candidateId: CandidateId): Promise<Scorecard | null> {
    const latest = this.scorecards
      .filter((scorecard) => scorecard.candidateId === candidateId)
      .reduce<Scorecard | null>(
        (newest, scorecard) =>
          newest === null || scorecard.createdAt >= newest.createdAt ? scorecard : newest,
        null,
      );
    return Promise.resolve(latest);
  }
}
