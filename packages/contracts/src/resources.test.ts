import { describe, expect, it } from 'vitest';

import {
  CandidateSummarySchema,
  CitationSchema,
  limitQuerySchema,
  ProblemSchema,
  ScorecardSchema,
} from './index';

const summary = {
  id: '00000000-0000-4000-8000-000000000001',
  alias: 'C04',
  displayName: null,
  guardStatus: 'clean',
  shortlisted: false,
  score: 62,
  mustHaves: { met: 3, total: 4 },
};

describe('CandidateSummarySchema', () => {
  it('accepts a blind, scored candidate', () => {
    expect(CandidateSummarySchema.safeParse(summary).success).toBe(true);
  });

  it.each([
    ['a score over 100', { ...summary, score: 101 }],
    ['a malformed alias', { ...summary, alias: 'Candidate 4' }],
    ['an unknown guard status', { ...summary, guardStatus: 'suspicious' }],
  ])('rejects %s', (_label, payload) => {
    expect(CandidateSummarySchema.safeParse(payload).success).toBe(false);
  });
});

describe('CitationSchema', () => {
  it('requires a ref like C04#3 and a span', () => {
    const citation = {
      ref: 'C04#3',
      section: 'experience',
      quote: 'Built RAG',
      span: { start: 0, end: 9 },
    };

    expect(CitationSchema.safeParse(citation).success).toBe(true);
    expect(CitationSchema.safeParse({ ...citation, ref: 'C04-3' }).success).toBe(false);
  });
});

describe('ScorecardSchema', () => {
  it('requires createdAt as an ISO timestamp', () => {
    const scorecard = {
      score: 62,
      mustHaves: { met: 3, total: 4 },
      requirements: [],
      strengths: [],
      concerns: [],
      summary: '',
      promptVersion: 'screening@1',
      models: { agent: 'lite', synthesis: 'flash' },
      createdAt: '2026-10-09T12:00:00.000Z',
      trace: [],
    };

    expect(ScorecardSchema.safeParse(scorecard).success).toBe(true);
    expect(ScorecardSchema.safeParse({ ...scorecard, createdAt: 'yesterday' }).success).toBe(false);
  });
});

describe('limitQuerySchema', () => {
  it.each([
    [{}, 20],
    [{ limit: '5' }, 5],
  ])('reads %j as limit %d', (query, limit) => {
    expect(limitQuerySchema(20).parse(query)).toEqual({ limit });
  });

  it.each(['0', '101', 'ten'])('rejects limit=%s', (limit) => {
    expect(limitQuerySchema(20).safeParse({ limit }).success).toBe(false);
  });
});

describe('ProblemSchema retryAfter', () => {
  it('accepts whole seconds and rejects a negative value', () => {
    const problem = {
      type: 'urn:hiresignal:problem:quota-exceeded',
      title: 'Daily LLM Quota Exceeded',
      status: 429,
      detail: 'Quota used up.',
      instance: '/api/candidates/x/screen',
      code: 'QUOTA_EXCEEDED',
      requestId: 'req-1',
    };

    expect(ProblemSchema.safeParse({ ...problem, retryAfter: 3600 }).success).toBe(true);
    expect(ProblemSchema.safeParse({ ...problem, retryAfter: -1 }).success).toBe(false);
  });
});
