import { z } from 'zod';

/**
 * Every kind of model generation the app makes (SPEC §7.2). A use case names its task; the
 * routing policy, not the use case, picks the model.
 */
export const LlmTaskSchema = z.enum([
  'guard.classify',
  'screen.agent',
  'screen.synthesize',
  'screen.repair',
  'ask.answer',
]);
/** See {@link LlmTaskSchema}. */
export type LlmTask = z.infer<typeof LlmTaskSchema>;

/** Embedding calls, logged alongside generations. Documents and queries use different task types. */
export const EmbeddingTaskSchema = z.enum(['embed.documents', 'embed.query']);
/** See {@link EmbeddingTaskSchema}. */
export type EmbeddingTask = z.infer<typeof EmbeddingTaskSchema>;

/** Generation model tiers: Flash-Lite for short, cheap calls and Flash for judgment (SPEC §9.1). */
export const ModelTierSchema = z.enum(['lite', 'flash']);
/** See {@link ModelTierSchema}. */
export type ModelTier = z.infer<typeof ModelTierSchema>;
