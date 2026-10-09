import type { CandidateAlias, CandidateId } from '../../domain/candidates/candidate';
import type { GuardStatus } from '../../domain/guard/guard-status';
import type { Scorecard } from '../../domain/scoring/scorecard';
import type { Clock } from '../ports/clock';
import type { Logger } from '../ports/logger';
import type { ScorecardRepository } from '../ports/scorecard-repository';
import type { ScreenCandidate } from './screen-candidate';

/** A candidate of the pool, as ingestion reported it. */
export interface PoolMember {
  candidateId: CandidateId;
  alias: CandidateAlias;
  guardStatus: GuardStatus;
}

/** What happened to one candidate. */
export type PoolScreening = {
  candidateId: CandidateId;
  alias: CandidateAlias;
} & (
  | {
      status: 'screened';
      scorecard: Scorecard;
      repairAttempted: boolean;
      downgraded: number;
    }
  /** It already had a scorecard: nothing ran, and the latest one is reported. */
  | { status: 'already-screened'; scorecard: Scorecard }
  /** Quarantined resumes are never screened (SPEC §9.4). */
  | { status: 'quarantined' }
);

/** Screens a pool. */
export type ScreenPool = (members: readonly PoolMember[]) => Promise<PoolScreening[]>;

/** Dependencies of {@link createScreenPool}. */
export interface ScreenPoolDeps {
  screen: ScreenCandidate;
  scorecards: ScorecardRepository;
  logger: Logger;
  clock: Clock;
}

/**
 * Precomputes scorecards for seeding (SPEC §20 Phase 5): screens every clean or flagged candidate
 * in alias order, one at a time, so a recording run stays under the free tier's per-minute limits
 * and the log reads top to bottom. A candidate that already has a scorecard is skipped before any
 * model call, so re-seeding without `--reset` is free. Quarantined candidates are never screened.
 *
 * Logs `seed.candidate_screened` per candidate with the alias, score and counts only.
 *
 * @throws whatever screening throws. Scorecards already stored stay stored, so a re-run picks up
 * where the failure happened.
 *
 * @example
 * const screenings = await screenPool(result.outcomes);
 */
export function createScreenPool(deps: ScreenPoolDeps): ScreenPool {
  return async (members) => {
    const ordered = [...members].sort((a, b) => a.alias.localeCompare(b.alias));
    const screenings: PoolScreening[] = [];
    for (const { candidateId, alias, guardStatus } of ordered) {
      if (guardStatus === 'quarantined') {
        screenings.push({ candidateId, alias, status: 'quarantined' });
        continue;
      }
      const existing = await deps.scorecards.latestFor(candidateId);
      if (existing !== null) {
        screenings.push({ candidateId, alias, status: 'already-screened', scorecard: existing });
        continue;
      }
      const started = deps.clock.now().getTime();
      const { scorecard, repairAttempted, downgraded, agentSteps } = await deps.screen({
        candidateId,
      });
      screenings.push({
        candidateId,
        alias,
        status: 'screened',
        scorecard,
        repairAttempted,
        downgraded,
      });
      deps.logger.info('seed.candidate_screened', {
        alias,
        candidateId,
        score: scorecard.score,
        mustHavesMet: scorecard.mustHavesMet,
        mustHavesTotal: scorecard.mustHavesTotal,
        citations: countCitations(scorecard),
        agentSteps,
        repairAttempted,
        downgraded,
        durationMs: deps.clock.now().getTime() - started,
      });
    }
    return screenings;
  };
}

/**
 * Counts the verified citations on a scorecard.
 *
 * @example
 * countCitations(scorecard); // 9
 */
export function countCitations(scorecard: Scorecard): number {
  return scorecard.result.requirements.reduce(
    (total, requirement) => total + requirement.citations.length,
    0,
  );
}
