import { z } from 'zod';

import { JsonObjectSchema, JsonValueSchema } from '../../../application/llm/json-value';
import { EmbeddingTaskSchema, LlmTaskSchema } from '../../../domain/routing/llm-task';

/**
 * A recorded generation (SPEC §9.8): `{ key, task, model, recordedAt, response, usage }`. The
 * response is our provider-neutral shape, so replay doesn't depend on SDK types.
 */
export const GenerationFixtureSchema = z.object({
  kind: z.literal('generate'),
  key: z.string().regex(/^[0-9a-f]{64}$/),
  task: LlmTaskSchema,
  model: z.string().min(1),
  recordedAt: z.iso.datetime(),
  response: z.object({
    content: JsonValueSchema,
    text: z.string(),
    functionCalls: z.array(
      z.object({ id: z.string().optional(), name: z.string(), args: JsonObjectSchema }),
    ),
    finishReason: z.enum(['stop', 'max_tokens', 'safety', 'other']),
    latencyMs: z.number().int().nonnegative(),
  }),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedTokens: z.number().int().nonnegative(),
  }),
});
/** See {@link GenerationFixtureSchema}. */
export type GenerationFixture = z.infer<typeof GenerationFixtureSchema>;

/** A recorded embedding call: one vector per input text, in order. Embeddings report no usage. */
export const EmbeddingFixtureSchema = z.object({
  kind: z.literal('embed'),
  key: z.string().regex(/^[0-9a-f]{64}$/),
  task: EmbeddingTaskSchema,
  model: z.string().min(1),
  recordedAt: z.iso.datetime(),
  response: z.object({ vectors: z.array(z.array(z.number())) }),
  usage: z.null(),
});
/** See {@link EmbeddingFixtureSchema}. */
export type EmbeddingFixture = z.infer<typeof EmbeddingFixtureSchema>;
