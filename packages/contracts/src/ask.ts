import { z } from 'zod';

import { CitationSchema } from './scorecards';

/** Longest question accepted, after trimming (SPEC §9.7). */
export const ASK_QUESTION_MAX_CHARS = 500;

/** Body of `POST /api/jobs/:slug/ask`. */
export const AskRequestSchema = z.object({
  question: z.string().trim().min(1).max(ASK_QUESTION_MAX_CHARS),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

/** A verified quote in an answer, with the candidate it belongs to, so the UI can link to them. */
export const AskCitationSchema = CitationSchema.extend({
  candidateId: z.uuid(),
  alias: z.string().regex(/^C\d{2}$/),
});
export type AskCitation = z.infer<typeof AskCitationSchema>;

/** Which routing rule picked the model tier (SPEC §9.1). */
export const RoutedReasonSchema = z.enum([
  'default',
  'comparative-intent',
  'candidate-count',
  'context-size',
]);
export type RoutedReason = z.infer<typeof RoutedReasonSchema>;

/**
 * Response of `POST /api/jobs/:slug/ask` (SPEC §10). With `insufficientEvidence`, `answer`
 * explains why and `citations` is empty. `model` and `routedReason` are `null` when no model was
 * called, because nothing in the pool was close enough to the question.
 */
export const AskResponseSchema = z.object({
  answer: z.string().min(1),
  insufficientEvidence: z.boolean(),
  citations: z.array(AskCitationSchema),
  model: z.string().min(1).nullable(),
  routedReason: RoutedReasonSchema.nullable(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;
