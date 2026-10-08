import { describe, expect, it } from 'vitest';

import { EmbeddingTaskSchema, LlmTaskSchema, ModelTierSchema } from './llm-task';

describe('LLM task names', () => {
  it('cover every generation the app makes, plus the platform smoke check (SPEC §9.1)', () => {
    expect(LlmTaskSchema.options).toEqual([
      'guard.classify',
      'screen.agent',
      'screen.synthesize',
      'screen.repair',
      'ask.answer',
      'platform.smoke',
    ]);
  });

  it('keep embedding calls separate from generations', () => {
    expect(EmbeddingTaskSchema.options).toEqual(['embed.documents', 'embed.query']);
    expect(LlmTaskSchema.safeParse('embed.query').success).toBe(false);
  });

  it('offer only the free-tier generation tiers', () => {
    expect(ModelTierSchema.options).toEqual(['lite', 'flash']);
    expect(ModelTierSchema.safeParse('pro').success).toBe(false);
  });
});
