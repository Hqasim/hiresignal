import type { Candidate, CandidateAlias, CandidateId } from '../../domain/candidates/candidate';
import type { EmbeddedChunk } from '../../domain/chunks/resume-chunk';
import type { GuardStatus } from '../../domain/guard/guard-status';
import type { GuardVerdict } from '../../domain/guard/guard-verdict';
import type { JobId } from '../../domain/jobs/job';
import type { RedactedText } from '../../domain/redaction/redacted-text';
import type { RedactionSummary } from '../../domain/redaction/redaction-summary';

interface IngestedCandidateFields {
  jobId: JobId;
  alias: CandidateAlias;
  displayName: string;
  sourceHash: string;
  redactedResume: RedactedText;
  redactionSummary: RedactionSummary;
  guardVerdict: GuardVerdict;
}

/**
 * The output of ingestion (SPEC §9.5). A quarantined resume is never chunked or embedded, so the
 * type only lets it carry an empty chunk list.
 */
export type IngestedCandidate =
  | (IngestedCandidateFields & { guardStatus: 'quarantined'; chunks: readonly [] })
  | (IngestedCandidateFields & {
      guardStatus: Exclude<GuardStatus, 'quarantined'>;
      chunks: readonly EmbeddedChunk[];
    });

/** What {@link CandidateRepository.insertIngested} did. */
export interface InsertIngestedResult {
  id: CandidateId;
  /** `false` when a candidate with the same job and source hash already existed. */
  created: boolean;
}

/** One row of a job's ranked candidate list: no resume text, and the latest score if any. */
export interface RankedCandidate {
  id: CandidateId;
  alias: CandidateAlias;
  displayName: string;
  guardStatus: GuardStatus;
  shortlistedAt: Date | null;
  latestScore: { score: number; mustHavesMet: number; mustHavesTotal: number } | null;
}

/** Persistence for candidates; also owns writing their chunks, in the same transaction. */
export interface CandidateRepository {
  /**
   * Stores the candidate and its chunks in one transaction. Idempotent on
   * `(jobId, sourceHash)`: if the candidate exists, nothing is written and its id is returned.
   *
   * @throws if another candidate in the job already uses the alias.
   */
  insertIngested(candidate: IngestedCandidate): Promise<InsertIngestedResult>;
  /** Returns the candidate, or `null` if there is none. */
  findById(id: CandidateId): Promise<Candidate | null>;
  /**
   * Returns the candidate already ingested from this source file for the job, or `null`. Ingestion
   * checks it first, so re-seeding makes no model calls for resumes it has stored.
   */
  findBySourceHash(jobId: JobId, sourceHash: string): Promise<Candidate | null>;
  /**
   * Deletes every candidate of the job, with their chunks and scorecards (`seed --reset`). Returns
   * how many were deleted. Needs the owner role: the runtime role `hiresignal_app` can't delete.
   */
  deleteByJob(jobId: JobId): Promise<number>;
  /**
   * Returns up to `limit` candidates of the job: quarantined last, then by latest score (highest
   * first, unscored after scored), then by alias.
   */
  listRanked(jobId: JobId, options: { limit: number }): Promise<RankedCandidate[]>;
  /**
   * Marks the candidate shortlisted at `at`. Idempotent: shortlisting again keeps the first time.
   * Returns the updated candidate, or `null` if there is none.
   */
  shortlist(id: CandidateId, at: Date): Promise<Candidate | null>;
}
