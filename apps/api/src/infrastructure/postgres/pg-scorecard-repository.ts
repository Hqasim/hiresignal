import type {
  NewScorecard,
  ScorecardRepository,
} from '../../application/ports/scorecard-repository';
import type { CandidateId } from '../../domain/candidates/candidate';
import type { Scorecard } from '../../domain/scoring/scorecard';
import type { Queryable } from './create-pool';
import { SCORECARD_COLUMNS, ScorecardRowSchema, toScorecard } from './pg-scorecard-rows';
import { queryRows } from './query-rows';

/**
 * {@link ScorecardRepository} on Postgres.
 *
 * @example
 * const scorecards = createPgScorecardRepository(pool);
 * const latest = await scorecards.latestFor(candidateId);
 */
export function createPgScorecardRepository(db: Queryable): ScorecardRepository {
  return {
    async save(scorecard: NewScorecard): Promise<Scorecard> {
      const [row] = await queryRows(
        db,
        `insert into scorecards (candidate_id, score, must_haves_met, must_haves_total, result,
                                 trace, prompt_version, models, created_at)
         values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9)
         returning ${SCORECARD_COLUMNS}`,
        [
          scorecard.candidateId,
          scorecard.score,
          scorecard.mustHavesMet,
          scorecard.mustHavesTotal,
          JSON.stringify(scorecard.result),
          JSON.stringify(scorecard.trace),
          scorecard.promptVersion,
          JSON.stringify(scorecard.models),
          scorecard.createdAt,
        ],
        ScorecardRowSchema,
      );
      if (row === undefined) {
        throw new Error('Saving a scorecard returned no row');
      }
      return toScorecard(row);
    },

    async latestFor(candidateId: CandidateId): Promise<Scorecard | null> {
      // Served by the scorecards_candidate_latest index (candidate_id, created_at desc).
      const [row] = await queryRows(
        db,
        `select ${SCORECARD_COLUMNS} from scorecards
         where candidate_id = $1
         order by created_at desc
         limit 1`,
        [candidateId],
        ScorecardRowSchema,
      );
      return row === undefined ? null : toScorecard(row);
    },
  };
}
