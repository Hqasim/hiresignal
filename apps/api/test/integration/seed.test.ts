import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SeedJobResult } from '../../src/application/ingest/seed-job';
import type { Candidate } from '../../src/domain/candidates/candidate';
import { createPgCandidateRepository } from '../../src/infrastructure/postgres/pg-candidate-repository';
import { createSeeder, loadSeedDataset, type Seeder } from '../../src/main/seed-wiring';
import { FakeClock } from '../fakes/fake-clock';
import { RecordingLogger } from '../fakes/recording-logger';
import { modelsFromEnvExample } from '../helpers/env-example-models';
import { createTestDatabase, type TestDatabase } from '../helpers/test-database';

// SPEC §20 Phase 4: seeding in replay mode, offline, produces the guard outcomes in SPEC §12.
// It replays the fixtures `npm run seed:record` committed, through the same wiring as the CLI.

let db: TestDatabase;
let seeder: Seeder;
let first: SeedJobResult;
const byAlias = new Map<string, Candidate>();

async function countRows(table: 'llm_calls' | 'resume_chunks'): Promise<number> {
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
