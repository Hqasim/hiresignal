import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CandidateRepository } from '../../src/application/ports/candidate-repository';
import type { JobRepository } from '../../src/application/ports/job-repository';
import { CandidateIdSchema } from '../../src/domain/candidates/candidate';
import type { Job } from '../../src/domain/jobs/job';
import { JobIdSchema, JobSlugSchema } from '../../src/domain/jobs/job';
import { createPgCandidateRepository } from '../../src/infrastructure/postgres/pg-candidate-repository';
import { createPgJobRepository } from '../../src/infrastructure/postgres/pg-job-repository';
import { aCandidate, aNewJob, aQuarantinedCandidate } from '../helpers/builders';
import { createTestDatabase, type TestDatabase } from '../helpers/test-database';

let db: TestDatabase;
let jobs: JobRepository;
let candidates: CandidateRepository;

beforeAll(async () => {
  db = await createTestDatabase();
  jobs = createPgJobRepository(db.pool);
  candidates = createPgCandidateRepository(db.pool);
});
afterAll(async () => {
  await db.drop();
});

describe('PgJobRepository', () => {
  it('round-trips a job and its requirements', async () => {
    const stored = await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('round-trip') }));

    expect(await jobs.findBySlug(stored.slug)).toEqual(stored);
    expect(stored.requirements).toEqual(aNewJob().requirements);
  });

  it('updates in place when the same slug is upserted again, so reseeding is idempotent', async () => {
    const slug = JobSlugSchema.parse('reseeded');
    const first = await jobs.upsert(aNewJob({ slug }));

    const second = await jobs.upsert(aNewJob({ slug, title: 'Renamed' }));

    expect(second.id).toBe(first.id);
    expect(second.title).toBe('Renamed');
  });

  it('finds a job by id', async () => {
    const stored = await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('by-id') }));

    expect(await jobs.findById(stored.id)).toEqual(stored);
    expect(
      await jobs.findById(JobIdSchema.parse('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });

  it('returns null for an unknown slug', async () => {
    expect(await jobs.findBySlug(JobSlugSchema.parse('no-such-job'))).toBeNull();
  });

  it('lists jobs up to the limit', async () => {
    await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('listed-a') }));
    await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('listed-b') }));

    expect(await jobs.list({ limit: 1 })).toHaveLength(1);
    expect((await jobs.list({ limit: 100 })).length).toBeGreaterThanOrEqual(2);
  });

  it('fails loudly when stored requirements no longer match the schema', async () => {
    const slug = JobSlugSchema.parse('corrupt-requirements');
    await jobs.upsert(aNewJob({ slug }));
    await db.pool.query(`update jobs set requirements = '[{"id":"R1"}]' where slug = $1`, [slug]);

    await expect(jobs.findBySlug(slug)).rejects.toThrow(/requirements/);
  });
});

describe('PgCandidateRepository', () => {
  let job: Job;

  beforeAll(async () => {
    job = await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('candidates-job') }));
  });

  it('stores a candidate with its chunks at the offsets ingestion computed', async () => {
    const ingested = aCandidate(job.id, 'C01', [
      { section: 'summary', text: 'Senior engineer.', theta: 0 },
      { section: 'experience', text: 'Built RAG on pgvector.', theta: 1 },
    ]);

    const { id, created } = await candidates.insertIngested(ingested);

    expect(created).toBe(true);
    expect(await candidates.findById(id)).toMatchObject({
      id,
      alias: 'C01',
      redactedResume: 'Senior engineer.\n\nBuilt RAG on pgvector.',
      redactionSummary: [{ type: 'EMAIL', count: 1 }],
      guardStatus: 'clean',
      shortlistedAt: null,
    });
    const { rows } = await db.pool.query<{ content: string; slice: string }>(
      `select c.content, substr(k.redacted_resume, c.start_offset + 1, c.end_offset - c.start_offset) as slice
       from resume_chunks c join candidates k on k.id = c.candidate_id
       where k.id = $1 order by c.ordinal`,
      [id],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.slice).toBe(row.content);
    }
  });

  it('returns the existing id without writing anything when the same resume is ingested again', async () => {
    const ingested = aCandidate(job.id, 'C02', [
      { section: 'skills', text: 'TypeScript', theta: 0 },
    ]);
    const first = await candidates.insertIngested(ingested);

    const second = await candidates.insertIngested(ingested);

    expect(second).toEqual({ id: first.id, created: false });
    const { rows } = await db.pool.query<{ chunks: number }>(
      'select count(*)::int as chunks from resume_chunks where candidate_id = $1',
      [first.id],
    );
    expect(rows[0]?.chunks).toBe(1);
  });

  it('rolls back the candidate when a chunk fails to insert', async () => {
    const ingested = aCandidate(job.id, 'C03', [
      { section: 'summary', text: 'One', theta: 0 },
      { section: 'summary', text: 'Two', theta: 0 },
    ]);
    if (ingested.guardStatus === 'quarantined') {
      throw new Error('builder returned a quarantined candidate');
    }
    const duplicateOrdinals = {
      ...ingested,
      chunks: ingested.chunks.map((chunk) => ({ ...chunk, ordinal: 0 })),
    };

    await expect(candidates.insertIngested(duplicateOrdinals)).rejects.toThrow(/duplicate key/);

    const { rows } = await db.pool.query<{ found: number }>(
      `select count(*)::int as found from candidates where job_id = $1 and alias = 'C03'`,
      [job.id],
    );
    expect(rows[0]?.found).toBe(0);
  });

  it('rejects a second candidate with an alias the job already uses', async () => {
    await candidates.insertIngested(
      aCandidate(job.id, 'C04', [{ section: 's', text: 'A', theta: 0 }]),
    );

    await expect(
      candidates.insertIngested(aCandidate(job.id, 'C04', [{ section: 's', text: 'B', theta: 0 }])),
    ).rejects.toThrow(/duplicate key/);
  });

  it('returns null for an unknown candidate', async () => {
    const unknown = CandidateIdSchema.parse('00000000-0000-4000-8000-000000000000');

    expect(await candidates.findById(unknown)).toBeNull();
    expect(await candidates.shortlist(unknown, new Date())).toBeNull();
  });

  it('keeps the first shortlist time when a candidate is shortlisted twice', async () => {
    const { id } = await candidates.insertIngested(
      aCandidate(job.id, 'C05', [{ section: 's', text: 'Shortlist me', theta: 0 }]),
    );
    const first = new Date('2026-10-08T10:00:00.000Z');

    await candidates.shortlist(id, first);
    const again = await candidates.shortlist(id, new Date('2026-10-09T10:00:00.000Z'));

    expect(again?.shortlistedAt).toEqual(first);
  });

  it('finds a candidate by the source hash it was ingested from, only within its job', async () => {
    const ingested = aCandidate(job.id, 'C06', [{ section: 's', text: 'Find me', theta: 0 }]);
    const { id } = await candidates.insertIngested(ingested);
    const otherJob = await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('other-hash-job') }));

    expect((await candidates.findBySourceHash(job.id, ingested.sourceHash))?.id).toBe(id);
    expect(await candidates.findBySourceHash(otherJob.id, ingested.sourceHash)).toBeNull();
    expect(await candidates.findBySourceHash(job.id, 'no-such-hash')).toBeNull();
  });
});

describe('PgCandidateRepository.deleteByJob', () => {
  it('deletes the job’s candidates with their chunks and leaves other jobs alone', async () => {
    const doomed = await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('reset-job') }));
    const kept = await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('kept-job') }));
    await candidates.insertIngested(
      aCandidate(doomed.id, 'C01', [{ section: 's', text: 'Gone', theta: 0 }]),
    );
    await candidates.insertIngested(aQuarantinedCandidate(doomed.id, 'C02'));
    const survivor = await candidates.insertIngested(
      aCandidate(kept.id, 'C01', [{ section: 's', text: 'Stays', theta: 0 }]),
    );

    const deleted = await candidates.deleteByJob(doomed.id);

    expect(deleted).toBe(2);
    expect(await candidates.listRanked(doomed.id, { limit: 10 })).toEqual([]);
    expect(await candidates.findById(survivor.id)).not.toBeNull();
    const orphans = await db.pool.query(
      `select count(*)::int as n from resume_chunks c
       where not exists (select 1 from candidates k where k.id = c.candidate_id)`,
    );
    expect(orphans.rows).toEqual([{ n: 0 }]);
    expect(await candidates.deleteByJob(doomed.id)).toBe(0);
  });
});

describe('PgCandidateRepository.listRanked', () => {
  it('puts scored candidates first by score, then unscored by alias, and quarantined last', async () => {
    const job = await jobs.upsert(aNewJob({ slug: JobSlugSchema.parse('ranking-job') }));
    const text = [{ section: 'summary', text: 'Engineer', theta: 0 }];
    const quarantined = await candidates.insertIngested(aQuarantinedCandidate(job.id, 'C01'));
    const unscoredLater = await candidates.insertIngested(aCandidate(job.id, 'C03', text));
    const unscoredEarlier = await candidates.insertIngested(aCandidate(job.id, 'C02', text));
    const low = await candidates.insertIngested(aCandidate(job.id, 'C04', text));
    const high = await candidates.insertIngested(aCandidate(job.id, 'C05', text));
    // An older, higher score for `low` proves only the latest scorecard counts.
    await insertScore(low.id, 95, '2026-10-01');
    await insertScore(low.id, 40, '2026-10-02');
    await insertScore(high.id, 80, '2026-10-02');

    const ranked = await candidates.listRanked(job.id, { limit: 50 });

    expect(ranked.map((row) => row.id)).toEqual([
      high.id,
      low.id,
      unscoredEarlier.id,
      unscoredLater.id,
      quarantined.id,
    ]);
    expect(ranked[1]?.latestScore).toEqual({ score: 40, mustHavesMet: 1, mustHavesTotal: 2 });
    expect(ranked[2]?.latestScore).toBeNull();
    expect(ranked[4]?.guardStatus).toBe('quarantined');
    expect(await candidates.listRanked(job.id, { limit: 2 })).toHaveLength(2);
  });
});

/** Writes a minimal scorecard row directly; the scorecard repository has its own tests. */
async function insertScore(candidateId: string, score: number, day: string): Promise<void> {
  await db.pool.query(
    `insert into scorecards (candidate_id, score, must_haves_met, must_haves_total, result, trace,
                             prompt_version, models, created_at)
     values ($1, $2, 1, 2, '{}', '[]', 'screening@test', '{}', $3)`,
    [candidateId, score, `${day}T00:00:00Z`],
  );
}
