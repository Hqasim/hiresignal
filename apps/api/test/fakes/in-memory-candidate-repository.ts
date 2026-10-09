import type {
  CandidateRepository,
  IngestedCandidate,
  InsertIngestedResult,
  RankedCandidate,
} from '../../src/application/ports/candidate-repository';
import {
  type Candidate,
  type CandidateId,
  CandidateIdSchema,
} from '../../src/domain/candidates/candidate';
import type { EmbeddedChunk } from '../../src/domain/chunks/resume-chunk';
import type { JobId } from '../../src/domain/jobs/job';
import type { Scorecard } from '../../src/domain/scoring/scorecard';

/** When the fake says candidates were created; tests don't depend on real time. */
const CREATED_AT = new Date('2026-10-09T12:00:00Z');

/**
 * {@link CandidateRepository} fake that keeps candidates and their chunks in memory, with the same
 * idempotency on `(jobId, sourceHash)` as Postgres. Ids are deterministic UUIDs.
 */
export class InMemoryCandidateRepository implements CandidateRepository {
  readonly candidates: Candidate[] = [];
  readonly chunks = new Map<CandidateId, readonly EmbeddedChunk[]>();

  /**
   * @param scorecards where `listRanked` reads latest scores from, like the SQL join; usually an
   *   `InMemoryScorecardRepository`. Without it, every candidate is unscored.
   */
  constructor(
    private readonly scorecards: { scorecards: readonly Scorecard[] } = { scorecards: [] },
  ) {}

  insertIngested(ingested: IngestedCandidate): Promise<InsertIngestedResult> {
    const existing = this.find(ingested.jobId, ingested.sourceHash);
    if (existing !== undefined) {
      return Promise.resolve({ id: existing.id, created: false });
    }
    if (this.candidates.some((c) => c.jobId === ingested.jobId && c.alias === ingested.alias)) {
      return Promise.reject(new Error(`Alias ${ingested.alias} is already used in this job`));
    }
    const { chunks, ...fields } = ingested;
    const id = CandidateIdSchema.parse(
      `00000000-0000-4000-8000-${String(this.candidates.length + 1).padStart(12, '0')}`,
    );
    this.candidates.push({ ...fields, id, shortlistedAt: null, createdAt: CREATED_AT });
    this.chunks.set(id, chunks);
    return Promise.resolve({ id, created: true });
  }

  findById(id: CandidateId): Promise<Candidate | null> {
    return Promise.resolve(this.candidates.find((c) => c.id === id) ?? null);
  }

  findBySourceHash(jobId: JobId, sourceHash: string): Promise<Candidate | null> {
    return Promise.resolve(this.find(jobId, sourceHash) ?? null);
  }

  deleteByJob(jobId: JobId): Promise<number> {
    const doomed = this.candidates.filter((c) => c.jobId === jobId);
    for (const candidate of doomed) {
      this.candidates.splice(this.candidates.indexOf(candidate), 1);
      this.chunks.delete(candidate.id);
    }
    return Promise.resolve(doomed.length);
  }

  listRanked(jobId: JobId, options: { limit: number }): Promise<RankedCandidate[]> {
    const rows = this.candidates
      .filter((c) => c.jobId === jobId)
      .map(({ id, alias, displayName, guardStatus, shortlistedAt }) => ({
        id,
        alias,
        displayName,
        guardStatus,
        shortlistedAt,
        latestScore: this.latestScore(id),
      }))
      .sort(
        (a, b) =>
          Number(a.guardStatus === 'quarantined') - Number(b.guardStatus === 'quarantined') ||
          (b.latestScore?.score ?? -1) - (a.latestScore?.score ?? -1) ||
          a.alias.localeCompare(b.alias),
      )
      .slice(0, options.limit);
    return Promise.resolve(rows);
  }

  shortlist(id: CandidateId, at: Date): Promise<Candidate | null> {
    const candidate = this.candidates.find((c) => c.id === id);
    if (candidate === undefined) {
      return Promise.resolve(null);
    }
    candidate.shortlistedAt ??= at;
    return Promise.resolve(candidate);
  }

  private find(jobId: JobId, sourceHash: string): Candidate | undefined {
    return this.candidates.find((c) => c.jobId === jobId && c.sourceHash === sourceHash);
  }

  private latestScore(id: CandidateId): RankedCandidate['latestScore'] {
    const latest = this.scorecards.scorecards
      .filter((scorecard) => scorecard.candidateId === id)
      .reduce<Scorecard | null>(
        (newest, scorecard) =>
          newest === null || scorecard.createdAt >= newest.createdAt ? scorecard : newest,
        null,
      );
    return latest === null
      ? null
      : {
          score: latest.score,
          mustHavesMet: latest.mustHavesMet,
          mustHavesTotal: latest.mustHavesTotal,
        };
  }
}
