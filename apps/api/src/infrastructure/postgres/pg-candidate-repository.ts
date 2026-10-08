import type { PoolClient } from 'pg';
import { z } from 'zod';

import type {
  CandidateRepository,
  IngestedCandidate,
  InsertIngestedResult,
  RankedCandidate,
} from '../../application/ports/candidate-repository';
import {
  type Candidate,
  type CandidateId,
  CandidateIdSchema,
} from '../../domain/candidates/candidate';
import type { EmbeddedChunk } from '../../domain/chunks/resume-chunk';
import type { JobId } from '../../domain/jobs/job';
import type { DbPool } from './create-pool';
import {
  CANDIDATE_COLUMNS,
  CandidateRowSchema,
  RankedCandidateRowSchema,
  toCandidate,
  toRankedCandidate,
} from './pg-candidate-rows';
import { queryRows } from './query-rows';
import { withTransaction } from './transaction';
import { toVectorLiteral } from './vector-literal';

const IdRowSchema = z.object({ id: CandidateIdSchema });

/**
 * {@link CandidateRepository} on Postgres. Needs the pool, not a single connection, because
 * `insertIngested` opens its own transaction.
 *
 * @example
 * const candidates = createPgCandidateRepository(pool);
 * const { id, created } = await candidates.insertIngested(ingested);
 */
export function createPgCandidateRepository(pool: DbPool): CandidateRepository {
  return {
    insertIngested: (candidate) => withTransaction(pool, (tx) => insertIngested(tx, candidate)),

    async findById(id: CandidateId): Promise<Candidate | null> {
      const [row] = await queryRows(
        pool,
        `select ${CANDIDATE_COLUMNS} from candidates k where k.id = $1`,
        [id],
        CandidateRowSchema,
      );
      return row === undefined ? null : toCandidate(row);
    },

    async listRanked(jobId: JobId, options: { limit: number }): Promise<RankedCandidate[]> {
      // The lateral join picks each candidate's newest scorecard; re-screening adds rows.
      const rows = await queryRows(
        pool,
        `select k.id, k.alias, k.display_name, k.guard_status, k.shortlisted_at,
                s.score, s.must_haves_met, s.must_haves_total
         from candidates k
         left join lateral (
           select score, must_haves_met, must_haves_total
           from scorecards
           where candidate_id = k.id
           order by created_at desc
           limit 1
         ) s on true
         where k.job_id = $1
         order by k.guard_status = 'quarantined', s.score desc nulls last, k.alias
         limit $2`,
        [jobId, options.limit],
        RankedCandidateRowSchema,
      );
      return rows.map(toRankedCandidate);
    },

    async shortlist(id: CandidateId, at: Date): Promise<Candidate | null> {
      // coalesce keeps the first shortlist time, so repeating the call changes nothing.
      const [row] = await queryRows(
        pool,
        `update candidates k set shortlisted_at = coalesce(k.shortlisted_at, $2)
         where k.id = $1
         returning ${CANDIDATE_COLUMNS}`,
        [id, at],
        CandidateRowSchema,
      );
      return row === undefined ? null : toCandidate(row);
    },
  };
}

async function insertIngested(
  tx: PoolClient,
  candidate: IngestedCandidate,
): Promise<InsertIngestedResult> {
  // `on conflict do nothing` returns no row for a resume that was already ingested.
  const [inserted] = await queryRows(
    tx,
    `insert into candidates (job_id, alias, display_name, source_hash, redacted_resume,
                             redaction_summary, guard_status, guard_verdict)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
     on conflict (job_id, source_hash) do nothing
     returning id`,
    [
      candidate.jobId,
      candidate.alias,
      candidate.displayName,
      candidate.sourceHash,
      candidate.redactedResume,
      JSON.stringify(candidate.redactionSummary),
      candidate.guardStatus,
      JSON.stringify(candidate.guardVerdict),
    ],
    IdRowSchema,
  );
  if (inserted === undefined) {
    const [existing] = await queryRows(
      tx,
      'select id from candidates where job_id = $1 and source_hash = $2',
      [candidate.jobId, candidate.sourceHash],
      IdRowSchema,
    );
    if (existing === undefined) {
      throw new Error('Candidate insert conflicted but no existing row was found');
    }
    return { id: existing.id, created: false };
  }
  await insertChunks(tx, inserted.id, candidate.chunks);
  return { id: inserted.id, created: true };
}

/** Inserts every chunk in one statement: each column travels as one array parameter. */
async function insertChunks(
  tx: PoolClient,
  candidateId: CandidateId,
  chunks: readonly EmbeddedChunk[],
): Promise<void> {
  if (chunks.length === 0) {
    return;
  }
  await tx.query(
    `insert into resume_chunks (candidate_id, ordinal, section, context_header, content,
                                start_offset, end_offset, token_estimate, embedding)
     select $1, c.ordinal, c.section, c.context_header, c.content,
            c.start_offset, c.end_offset, c.token_estimate, c.embedding::vector
     from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::int[],
                 $9::text[])
       as c(ordinal, section, context_header, content, start_offset, end_offset, token_estimate,
            embedding)`,
    [
      candidateId,
      chunks.map((chunk) => chunk.ordinal),
      chunks.map((chunk) => chunk.section),
      chunks.map((chunk) => chunk.contextHeader),
      chunks.map((chunk) => chunk.content),
      chunks.map((chunk) => chunk.startOffset),
      chunks.map((chunk) => chunk.endOffset),
      chunks.map((chunk) => chunk.tokenEstimate),
      chunks.map((chunk) => toVectorLiteral(chunk.embedding)),
    ],
  );
}
