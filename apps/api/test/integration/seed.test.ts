import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SeedJobResult } from '../../src/application/ingest/seed-job';
import type { PoolScreening } from '../../src/application/screening/screen-pool';
import type { Candidate } from '../../src/domain/candidates/candidate';
import { parseChunkRef } from '../../src/domain/candidates/chunk-ref';
import type { Scorecard } from '../../src/domain/scoring/scorecard';
import { createPgCandidateRepository } from '../../src/infrastructure/postgres/pg-candidate-repository';
import { createPgScorecardRepository } from '../../src/infrastructure/postgres/pg-scorecard-repository';
import { createSeeder, loadSeedDataset, type Seeder } from '../../src/main/seed-wiring';
import { FakeClock } from '../fakes/fake-clock';
import { RecordingLogger } from '../fakes/recording-logger';
import { modelsFromEnvExample } from '../helpers/env-example-models';
import { createTestDatabase, type TestDatabase } from '../helpers/test-database';

// SPEC §20 Phases 4 and 5: seeding in replay mode, offline, produces the guard outcomes in SPEC §12
// and a verified scorecard for every candidate that isn't quarantined. It replays the fixtures
// `npm run seed:record` committed, through the same wiring as the CLI.

let db: TestDatabase;
let seeder: Seeder;
let first: SeedJobResult;
let screenings: PoolScreening[];
const byAlias = new Map<string, Candidate>();
const scorecardsByAlias = new Map<string, Scorecard>();

async function countRows(table: 'llm_calls' | 'resume_chunks' | 'scorecards'): Promise<number> {
  const result = await db.pool.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return result.rows[0]?.n ?? 0;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const { models, embeddingModel } = modelsFromEnvExample();
  seeder = createSeeder(
    { mode: 'replay', apiKey: undefined, models, embeddingModel },
    {
      pool: db.pool,
      clock: new FakeClock(),
      logger: new RecordingLogger(),
      sleep: () => Promise.reject(new Error('replay must never wait')),
    },
  );
  first = await seeder.seed({ ...(await loadSeedDataset()), reset: false });
  const candidates = createPgCandidateRepository(db.pool);
  for (const outcome of first.outcomes) {
    const candidate = await candidates.findById(outcome.candidateId);
    if (candidate !== null) {
      byAlias.set(candidate.alias, candidate);
    }
  }
  screenings = await seeder.screen(first.outcomes);
  const scorecards = createPgScorecardRepository(db.pool);
  for (const [alias, stored] of byAlias) {
    const scorecard = await scorecards.latestFor(stored.id);
    if (scorecard !== null) {
      scorecardsByAlias.set(alias, scorecard);
    }
  }
});

afterAll(async () => {
  await db.drop();
});

function candidate(alias: string): Candidate {
  const found = byAlias.get(alias);
  if (found === undefined) {
    throw new Error(`${alias} wasn't seeded`);
  }
  return found;
}

function scoreOf(alias: string): number {
  const scorecard = scorecardsByAlias.get(alias);
  if (scorecard === undefined) {
    throw new Error(`${alias} has no scorecard`);
  }
  return scorecard.score;
}

// Runs before the ingestion block below, whose last test resets the job and deletes scorecards.
describe('npm run seed precomputes scorecards (replay)', () => {
  it('stores one scorecard for each of the eight candidates that are not quarantined', () => {
    expect([...scorecardsByAlias.keys()].sort()).toEqual([
      'C01',
      'C02',
      'C03',
      'C04',
      'C05',
      'C08',
      'C09',
      'C10',
    ]);
    expect(screenings.filter((s) => s.status === 'screened')).toHaveLength(8);
  });

  it('never screens the quarantined C06 and C07', () => {
    expect(scorecardsByAlias.has('C06')).toBe(false);
    expect(scorecardsByAlias.has('C07')).toBe(false);
    expect(screenings.filter((s) => s.status === 'quarantined').map((s) => s.alias)).toEqual([
      'C06',
      'C07',
    ]);
  });

  it("verifies 100% of citations: each quote is the candidate's resume text at its span, inside the cited chunk", async () => {
    let citations = 0;
    for (const [alias, scorecard] of scorecardsByAlias) {
      const resume = candidate(alias).redactedResume;
      for (const requirement of scorecard.result.requirements) {
        for (const citation of requirement.citations) {
          citations += 1;
          const ref = parseChunkRef(citation.ref);
          expect(ref?.alias).toBe(alias);
          expect(resume.slice(citation.span.start, citation.span.end)).toBe(citation.quote);
          const chunk = await db.pool.query<{ start_offset: number; end_offset: number }>(
            `select c.start_offset, c.end_offset from resume_chunks c
             join candidates k on k.id = c.candidate_id
             where k.alias = $1 and c.ordinal = $2`,
            [alias, ref?.ordinal],
          );
          const [row] = chunk.rows;
          expect(row).toBeDefined();
          expect(citation.span.start).toBeGreaterThanOrEqual(row?.start_offset ?? Infinity);
          expect(citation.span.end).toBeLessThanOrEqual(row?.end_offset ?? -1);
        }
      }
    }
    expect(citations).toBe(73);
  });

  it('backs every strong or partial rating with at least one citation', () => {
    for (const scorecard of scorecardsByAlias.values()) {
      for (const requirement of scorecard.result.requirements) {
        if (requirement.rating === 'strong' || requirement.rating === 'partial') {
          expect(requirement.citations.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('ranks C01 and C02 at the top, and the quarantined candidates last', async () => {
    const ranked = await createPgCandidateRepository(db.pool).listRanked(first.jobId, {
      limit: 10,
    });

    expect(ranked.slice(0, 2).map((row) => row.alias)).toEqual(['C01', 'C02']);
    expect(ranked.slice(-2).map((row) => row.alias)).toEqual(['C06', 'C07']);
  });

  it('penalizes C03 for claims without evidence: below C01, C02 and C05, with nothing rated strong', () => {
    const c03 = scorecardsByAlias.get('C03');

    expect(scoreOf('C03')).toBeLessThan(Math.min(scoreOf('C01'), scoreOf('C02'), scoreOf('C05')));
    const weak = c03?.result.requirements.filter(
      (r) => r.rating === 'partial' || r.rating === 'unclear',
    );
    expect(weak?.length).toBeGreaterThanOrEqual(2);
    expect(c03?.result.requirements.some((r) => r.rating === 'strong')).toBe(false);
  });

  it('stores the prompt version, both models, every requirement and a trace for each scorecard', () => {
    for (const scorecard of scorecardsByAlias.values()) {
      expect(scorecard.promptVersion).toBe('screening@1');
      expect(scorecard.models).toEqual({
        agent: 'gemini-3.5-flash-lite',
        synthesis: 'gemini-3.5-flash',
      });
      expect(scorecard.trace.length).toBeGreaterThan(0);
      expect(scorecard.result.requirements.map((r) => r.requirementId)).toEqual([
        'R1',
        'R2',
        'R3',
        'R4',
        'R5',
        'R6',
        'R7',
      ]);
    }
  });

  it('replays every screening call, so no model is called live', async () => {
    const calls = await db.pool.query<{ source: string }>(
      "select source from llm_calls where task like 'screen.%' or task = 'embed.query'",
    );

    expect(calls.rows.length).toBeGreaterThan(0);
    expect(calls.rows.every((row) => row.source === 'replay')).toBe(true);
  });

  it('screens nobody again on a second run, and calls no model', async () => {
    const calls = await countRows('llm_calls');

    const again = await seeder.screen(first.outcomes);

    expect(again.filter((s) => s.status === 'screened')).toEqual([]);
    expect(await countRows('llm_calls')).toBe(calls);
    expect(await countRows('scorecards')).toBe(8);
  });
});

describe('npm run seed (replay)', () => {
  it('stores all ten candidates', () => {
    expect([...byAlias.keys()].sort()).toEqual([
      'C01',
      'C02',
      'C03',
      'C04',
      'C05',
      'C06',
      'C07',
      'C08',
      'C09',
      'C10',
    ]);
  });

  it('quarantines C06 on its hidden markup alone, without asking the classifier', () => {
    const { guardStatus, guardVerdict } = candidate('C06');

    expect(guardStatus).toBe('quarantined');
    expect(guardVerdict.classifier).toBeNull();
    expect(guardVerdict.signals.map((s) => `${s.id}:${s.severity}`)).toEqual(
      expect.arrayContaining(['L1.html-comment:high', 'L1.white-text:high']),
    );
  });

  it('quarantines C07 on a confident malicious verdict from the classifier', () => {
    const { guardStatus, guardVerdict } = candidate('C07');

    expect(guardStatus).toBe('quarantined');
    expect(guardVerdict.classifier?.verdict).toBe('malicious');
    expect(guardVerdict.classifier?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(guardVerdict.signals.every((s) => s.severity === 'medium')).toBe(true);
  });

  it('keeps C02 clean, with its security vocabulary dismissed rather than punished', () => {
    const { guardStatus, guardVerdict } = candidate('C02');

    expect(guardStatus).toBe('clean');
    expect(guardVerdict.classifier?.verdict).toBe('benign');
    expect(guardVerdict.signals).toEqual([]);
    expect(guardVerdict.dismissed.map((s) => s.id)).toEqual(['L2.instruction-override']);
  });

  it('keeps C10 clean and fully redacted, with its zero-width spaces dismissed', () => {
    const { guardStatus, guardVerdict, redactedResume, displayName } = candidate('C10');

    expect(guardStatus).toBe('clean');
    expect(guardVerdict.dismissed.map((s) => s.id)).toEqual(['L0.zero-width']);
    expect(redactedResume).not.toMatch(
      /Gabriel|Silva|example\.(?:com|org)|555|Larkspur|97205|linkedin|github\.com\/|https?:|Cascadia/,
    );
    // Years are redacted only in Education (SPEC §9.3); in Experience they are job evidence.
    const education = redactedResume.slice(redactedResume.indexOf('## Education'));
    expect(education).toContain('[SCHOOL_1], [GRAD_YEAR_1]–[GRAD_YEAR_2]');
    expect(education).not.toMatch(/\b20(?:12|16)\b/);
    expect(redactedResume).not.toContain('\u{200B}');
    expect(displayName).toBe('Gabriel Silva');
  });

  it.each(['C01', 'C03', 'C04', 'C05', 'C08', 'C09'])('keeps %s clean with no signals', (alias) => {
    const { guardStatus, guardVerdict } = candidate(alias);

    expect(guardStatus).toBe('clean');
    expect(guardVerdict.signals).toEqual([]);
    expect(guardVerdict.dismissed).toEqual([]);
  });

  it('never chunks a quarantined resume, and chunks every other one into exact slices', async () => {
    const rows = await db.pool.query<{
      alias: string;
      content: string;
      start_offset: number;
      end_offset: number;
    }>(
      `select k.alias, c.content, c.start_offset, c.end_offset
       from resume_chunks c join candidates k on k.id = c.candidate_id`,
    );
    const aliases = new Set(rows.rows.map((row) => row.alias));

    expect(aliases.has('C06')).toBe(false);
    expect(aliases.has('C07')).toBe(false);
    expect(aliases.size).toBe(8);
    for (const row of rows.rows) {
      expect(candidate(row.alias).redactedResume.slice(row.start_offset, row.end_offset)).toBe(
        row.content,
      );
    }
  });

  it('logs every replayed model call as replay, never live', async () => {
    const calls = await db.pool.query<{ source: string; task: string }>(
      'select source, task from llm_calls',
    );

    expect(calls.rows.length).toBeGreaterThan(0);
    expect(calls.rows.every((row) => row.source === 'replay')).toBe(true);
    expect(seeder.tally().live).toBe(0);
    expect(seeder.tally().fallbacks).toBe(0);
  });

  it('changes nothing when run again', async () => {
    const calls = await countRows('llm_calls');
    const chunks = await countRows('resume_chunks');

    const again = await seeder.seed({ ...(await loadSeedDataset()), reset: false });

    expect(again.outcomes.every((outcome) => !outcome.created)).toBe(true);
    expect(again.outcomes.map((o) => o.guardStatus)).toEqual(
      first.outcomes.map((o) => o.guardStatus),
    );
    expect(await countRows('llm_calls')).toBe(calls);
    expect(await countRows('resume_chunks')).toBe(chunks);
  });

  it('re-creates every candidate with the same outcomes after a reset', async () => {
    const chunks = await countRows('resume_chunks');

    const reset = await seeder.seed({ ...(await loadSeedDataset()), reset: true });

    expect(reset.deleted).toBe(10);
    expect(reset.outcomes.every((outcome) => outcome.created)).toBe(true);
    expect(reset.outcomes.map((o) => o.guardStatus)).toEqual(
      first.outcomes.map((o) => o.guardStatus),
    );
    expect(await countRows('resume_chunks')).toBe(chunks);
  });
});
