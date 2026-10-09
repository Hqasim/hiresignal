import { z } from 'zod';

import { TextSpanSchema } from './common';
import { MustHavesSchema, ScorecardSchema } from './scorecards';

/** Path parameters of `/api/candidates/:id…`. */
export const CandidateIdParamsSchema = z.object({ id: z.uuid() });

/** The injection guard's decision for a resume (SPEC §9.4). */
export const GuardStatusSchema = z.enum(['clean', 'flagged', 'quarantined']);
export type GuardStatus = z.infer<typeof GuardStatusSchema>;

/**
 * One row of a job's ranked candidate list. `displayName` stays `null` until a person shortlists
 * the candidate (blind screening).
 */
export const CandidateSummarySchema = z.object({
  id: z.uuid(),
  alias: z.string().regex(/^C\d{2}$/),
  displayName: z.string().min(1).nullable(),
  guardStatus: GuardStatusSchema,
  shortlisted: z.boolean(),
  score: z.int().min(0).max(100).nullable(),
  mustHaves: MustHavesSchema.nullable(),
});
export type CandidateSummary = z.infer<typeof CandidateSummarySchema>;

/** Response of `GET /api/jobs/:slug/candidates`: score descending, quarantined last. */
export const CandidateListResponseSchema = z.object({
  candidates: z.array(CandidateSummarySchema),
});
export type CandidateListResponse = z.infer<typeof CandidateListResponseSchema>;

/** One guard rule hit, with its location in the redacted resume when it has one. */
export const GuardSignalSchema = z.object({
  id: z.string().min(1),
  layer: z.enum(['L0', 'L1', 'L2']),
  severity: z.enum(['medium', 'high']),
  label: z.string().min(1),
  span: TextSpanSchema.nullable(),
  excerpt: z.string(),
});
export type GuardSignal = z.infer<typeof GuardSignalSchema>;

/** The L3 classifier's verdict. */
export const ClassifierVerdictSchema = z.object({
  verdict: z.enum(['benign', 'suspicious', 'malicious']),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});
export type ClassifierVerdict = z.infer<typeof ClassifierVerdictSchema>;

/** How many distinct values of one kind of PII redaction replaced. */
export const RedactionCountSchema = z.object({
  type: z.enum(['PERSON', 'EMAIL', 'PHONE', 'URL', 'ADDRESS', 'SCHOOL', 'GRAD_YEAR']),
  count: z.int().positive(),
});
export type RedactionCount = z.infer<typeof RedactionCountSchema>;

/**
 * Response of `GET /api/candidates/:id` (SPEC §10): the redacted resume, what was redacted, the
 * guard verdict with spans, and the latest scorecard (`null` if never screened or quarantined).
 */
export const CandidateDetailSchema = CandidateSummarySchema.extend({
  redactedResume: z.string(),
  redactionSummary: z.array(RedactionCountSchema),
  guard: z.object({
    status: GuardStatusSchema,
    signals: z.array(GuardSignalSchema),
    dismissed: z.array(GuardSignalSchema),
    classifier: ClassifierVerdictSchema.nullable(),
  }),
  scorecard: ScorecardSchema.nullable(),
});
export type CandidateDetail = z.infer<typeof CandidateDetailSchema>;

/** Response of `POST /api/candidates/:id/screen`: the new scorecard. */
export const ScreenResponseSchema = z.object({ scorecard: ScorecardSchema });
export type ScreenResponse = z.infer<typeof ScreenResponseSchema>;
