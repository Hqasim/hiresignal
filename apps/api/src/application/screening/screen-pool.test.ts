import { beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from '../../../test/fakes/fake-clock';
import { InMemoryScorecardRepository } from '../../../test/fakes/in-memory-scorecard-repository';
import { RecordingLogger } from '../../../test/fakes/recording-logger';
import { aNewJob } from '../../../test/helpers/builders';
import type { CandidateId } from '../../domain/candidates/candidate';
import { CandidateAliasSchema, CandidateIdSchema } from '../../domain/candidates/candidate';
import { ChunkRefSchema } from '../../domain/candidates/chunk-ref';
import type { GuardStatus } from '../../domain/guard/guard-status';
import { type Job, JobIdSchema } from '../../domain/jobs/job';
import type { NewScorecard } from '../ports/scorecard-repository';
import { formatRankingTable } from './ranking-table';
import type { ScreenCandidate } from './screen-candidate';
import { createScreenPool, type PoolMember } from './screen-pool';

function member(alias: string, guardStatus: GuardStatus): PoolMember {
  return {
    alias: CandidateAliasSchema.parse(alias),
    candidateId: CandidateIdSchema.parse(`00000000-0000-4000-8000-0000000000${alias.slice(1)}`),
    guardStatus,
  };
}

function aScorecard(candidateId: CandidateId, score: number): NewScorecard {
  return {
    candidateId,
    score,
    mustHavesMet: 1,
    mustHavesTotal: 1,
    result: {
      requirements: [
        {
          requirementId: 'R1',
          rating: 'strong',
          rationale: 'Built React apps.',
          citations: [
            {
              ref: ChunkRefSchema.parse('C01#0'),
              section: 'experience',
              quote: 'Built React apps',
              span: { start: 0, end: 16 },
            },
          ],
          note: null,
        },
        {
          requirementId: 'R5',
          rating: 'unclear',
          rationale: 'Vague.',
          citations: [],
          note: 'citation_failed',
        },
      ],
      strengths: [],
      concerns: [],
      summary: 'Summary.',
    },
    trace: [],
    promptVersion: 'screening@1',
    models: { agent: 'lite-model', synthesis: 'flash-model' },
    createdAt: new Date('2026-10-09T12:00:00Z'),
  };
}

const JOB: Job = {
  ...aNewJob(),
  id: JobIdSchema.parse('00000000-0000-4000-9000-000000000001'),
  createdAt: new Date('2026-10-09T12:00:00Z'),
};

let scorecards: InMemoryScorecardRepository;
let logger: RecordingLogger;
let screened: CandidateId[];

beforeEach(() => {
  scorecards = new InMemoryScorecardRepository();
  logger = new RecordingLogger();
  screened = [];
});

/** A fake screening that scores each candidate 10 × its alias number and marks C02 repaired. */
const screen: ScreenCandidate = async ({ candidateId }) => {
  screened.push(candidateId);
  const score = 10 * Number(candidateId.slice(-2));
  const scorecard = await scorecards.save(aScorecard(candidateId, score));
  const repaired = candidateId.endsWith('02');
  return {
    scorecard,
    job: JOB,
    repairAttempted: repaired,
    downgraded: repaired ? 1 : 0,
    agentSteps: 3,
  };
};

function pool() {
  return createScreenPool({ screen, scorecards, logger, clock: new FakeClock() });
}

describe('createScreenPool', () => {
  it('screens clean and flagged candidates in alias order, and never a quarantined one', async () => {
    const members = [
      member('C03', 'flagged'),
      member('C02', 'quarantined'),
      member('C01', 'clean'),
    ];

    const screenings = await pool()(members);

    expect(screenings.map((s) => [s.alias, s.status])).toEqual([
      ['C01', 'screened'],
      ['C02', 'quarantined'],
      ['C03', 'screened'],
    ]);
    expect(screened).toEqual([members[2]?.candidateId, members[0]?.candidateId]);
  });

  it('skips a candidate that already has a scorecard, without screening it again', async () => {
    const c01 = member('C01', 'clean');
    await scorecards.save(aScorecard(c01.candidateId, 55));

    const [screening] = await pool()([c01]);

    expect(screening).toMatchObject({ status: 'already-screened', scorecard: { score: 55 } });
    expect(screened).toEqual([]);
  });

  it('logs scores and counts for each screened candidate, never text', async () => {
    await pool()([member('C01', 'clean')]);

    expect(logger.entries).toEqual([
      {
        level: 'info',
        event: 'seed.candidate_screened',
        fields: expect.objectContaining({
          alias: 'C01',
          score: 10,
          citations: 1,
          agentSteps: 3,
          repairAttempted: false,
          downgraded: 0,
        }) as unknown,
      },
    ]);
  });
});

describe('formatRankingTable', () => {
  it('ranks by score with quarantined candidates last, and notes repairs and stored scorecards', async () => {
    const c04 = member('C04', 'clean');
    await scorecards.save(aScorecard(c04.candidateId, 15));
    const screenings = await pool()([
      member('C01', 'clean'),
      member('C02', 'clean'),
      member('C03', 'quarantined'),
      c04,
    ]);

    expect(formatRankingTable(screenings).split('\n')).toEqual([
      '#  Alias  Score  Must-haves  Ratings (S/P/N/U)  Citations  Notes',
      '1  C02    20     1/1         1/0/0/1            1          repaired, 1 downgraded',
      '2  C04    15     1/1         1/0/0/1            1          stored',
      '3  C01    10     1/1         1/0/0/1            1          –',
      '4  C03    –      –           –                  –          quarantined',
    ]);
  });
});
