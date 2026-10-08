import { z } from 'zod';

import type { GuardStatus } from '../guard/guard-status';
import type { GuardVerdict } from '../guard/guard-verdict';
import type { JobId } from '../jobs/job';
import type { RedactedText } from '../redaction/redacted-text';
import type { RedactionSummary } from '../redaction/redaction-summary';

/** Database id of a candidate. */
export const CandidateIdSchema = z.uuid().brand<'CandidateId'>();
/** See {@link CandidateIdSchema}. */
export type CandidateId = z.infer<typeof CandidateIdSchema>;

/**
 * The blind label shown everywhere until a person shortlists the candidate, for example `C04`.
 * Unique within a job.
 */
export const CandidateAliasSchema = z
  .string()
  .regex(/^C\d{2}$/, 'Use C followed by two digits')
  .brand<'CandidateAlias'>();
/** See {@link CandidateAliasSchema}. */
export type CandidateAlias = z.infer<typeof CandidateAliasSchema>;

/**
 * A screened applicant. Only redacted text is stored; the original resume never is (SPEC §9.3).
 * `displayName` is synthetic and is revealed only after shortlisting.
 */
export interface Candidate {
  id: CandidateId;
  jobId: JobId;
  alias: CandidateAlias;
  displayName: string;
  /** sha256 of the source file; ingestion is idempotent on `(jobId, sourceHash)`. */
  sourceHash: string;
  redactedResume: RedactedText;
  redactionSummary: RedactionSummary;
  guardStatus: GuardStatus;
  guardVerdict: GuardVerdict;
  /** When a person shortlisted the candidate; `null` until then. */
  shortlistedAt: Date | null;
  createdAt: Date;
}
