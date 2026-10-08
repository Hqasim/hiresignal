import { z } from 'zod';

import type { RankedCandidate } from '../../application/ports/candidate-repository';
import {
  type Candidate,
  CandidateAliasSchema,
  CandidateIdSchema,
} from '../../domain/candidates/candidate';
import { GuardStatusSchema } from '../../domain/guard/guard-status';
import { GuardVerdictSchema } from '../../domain/guard/guard-verdict';
import { JobIdSchema } from '../../domain/jobs/job';
import { rehydrateRedactedText } from '../../domain/redaction/redacted-text';
import { RedactionSummarySchema } from '../../domain/redaction/redaction-summary';

/** A `candidates` row as node-postgres returns it, with JSONB validated. */
export const CandidateRowSchema = z.object({
  id: CandidateIdSchema,
  job_id: JobIdSchema,
  alias: CandidateAliasSchema,
  display_name: z.string(),
  source_hash: z.string(),
  redacted_resume: z.string(),
  redaction_summary: RedactionSummarySchema,
  guard_status: GuardStatusSchema,
  guard_verdict: GuardVerdictSchema,
  shortlisted_at: z.date().nullable(),
  created_at: z.date(),
});
/** See {@link CandidateRowSchema}. */
export type CandidateRow = z.infer<typeof CandidateRowSchema>;

/** Every column of `candidates`, qualified with the alias `k`. */
export const CANDIDATE_COLUMNS = `k.id, k.job_id, k.alias, k.display_name, k.source_hash,
  k.redacted_resume, k.redaction_summary, k.guard_status, k.guard_verdict, k.shortlisted_at,
  k.created_at`;

/**
 * Maps a validated row to the domain entity. `redacted_resume` is only ever written from
 * `RedactedText`, so its brand is restored here.
 *
 * @example
 * const candidate = toCandidate(CandidateRowSchema.parse(row));
 */
export function toCandidate(row: CandidateRow): Candidate {
  return {
    id: row.id,
    jobId: row.job_id,
    alias: row.alias,
    displayName: row.display_name,
    sourceHash: row.source_hash,
    redactedResume: rehydrateRedactedText(row.redacted_resume),
    redactionSummary: row.redaction_summary,
    guardStatus: row.guard_status,
    guardVerdict: row.guard_verdict,
    shortlistedAt: row.shortlisted_at,
    createdAt: row.created_at,
  };
}

/** A row of the ranked list: candidate columns plus the latest scorecard's numbers, if any. */
export const RankedCandidateRowSchema = z.object({
  id: CandidateIdSchema,
  alias: CandidateAliasSchema,
  display_name: z.string(),
  guard_status: GuardStatusSchema,
  shortlisted_at: z.date().nullable(),
  score: z.number().int().nullable(),
  must_haves_met: z.number().int().nullable(),
  must_haves_total: z.number().int().nullable(),
});
/** See {@link RankedCandidateRowSchema}. */
export type RankedCandidateRow = z.infer<typeof RankedCandidateRowSchema>;

/**
 * Maps a ranked-list row. The scorecard columns come from a left join, so they are all `null`
 * for a candidate without a scorecard.
 *
 * @example
 * const ranked = toRankedCandidate(RankedCandidateRowSchema.parse(row));
 */
export function toRankedCandidate(row: RankedCandidateRow): RankedCandidate {
  const { score, must_haves_met: met, must_haves_total: total } = row;
  return {
    id: row.id,
    alias: row.alias,
    displayName: row.display_name,
    guardStatus: row.guard_status,
    shortlistedAt: row.shortlisted_at,
    latestScore:
      score === null || met === null || total === null
        ? null
        : { score, mustHavesMet: met, mustHavesTotal: total },
  };
}
