import { describe, expect, it } from 'vitest';

import { AskRequestSchema, AskResponseSchema } from './index';

describe('AskRequestSchema', () => {
  it('trims the question and accepts up to 500 characters', () => {
    expect(AskRequestSchema.parse({ question: '  Who knows Go?  ' })).toEqual({
      question: 'Who knows Go?',
    });
    expect(AskRequestSchema.safeParse({ question: 'x'.repeat(500) }).success).toBe(true);
  });

  it.each([
    {},
    { question: '' },
    { question: '   ' },
    { question: 'x'.repeat(501) },
    { question: 7 },
  ])('rejects %j', (body) => {
    expect(AskRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('AskResponseSchema', () => {
  const citation = {
    ref: 'C01#1',
    candidateId: '00000000-0000-4000-8000-000000000001',
    alias: 'C01',
    section: 'experience',
    quote: 'Led the build of a retrieval-augmented support assistant',
    span: { start: 410, end: 466 },
  };

  it('accepts a cited answer with the model and the rule that routed it', () => {
    const response = {
      answer: 'C01 led a retrieval-augmented assistant.',
      insufficientEvidence: false,
      citations: [citation],
      model: 'gemini-3.5-flash',
      routedReason: 'comparative-intent',
    };

    expect(AskResponseSchema.safeParse(response).success).toBe(true);
    expect(AskResponseSchema.safeParse({ ...response, routedReason: 'whim' }).success).toBe(false);
  });

  it('accepts insufficient evidence with no model call', () => {
    expect(
      AskResponseSchema.safeParse({
        answer: 'Nothing in the pool is close enough.',
        insufficientEvidence: true,
        citations: [],
        model: null,
        routedReason: null,
      }).success,
    ).toBe(true);
  });
});
