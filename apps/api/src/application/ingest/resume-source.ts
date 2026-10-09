import type { CandidateAlias } from '../../domain/candidates/candidate';

/**
 * One resume as ingestion receives it: raw Markdown, not yet scanned or redacted. In this demo
 * the seed CLI reads it from `data/resumes/` (SPEC §12); a real product would get it from an
 * upload.
 */
export interface ResumeSource {
  /** The blind label the candidate gets, for example `C04`. */
  alias: CandidateAlias;
  /** sha256 of the source file, so ingesting the same file twice is a no-op (SPEC §9.5 step 7). */
  sourceHash: string;
  /** The raw resume. It may hold PII and injection attempts; only ingestion reads it. */
  text: string;
}
