import { describe, expect, it } from 'vitest';

import { AgentTraceSchema, ScorecardModelsSchema, ScorecardResultSchema } from './scorecard';

const citation = {
  ref: 'C01#3',
  section: 'experience',
  quote: 'Shipped a retrieval pipeline on pgvector',
  span: { start: 410, end: 450 },
};
const assessment = {
  requirementId: 'R4',
  rating: 'strong',
  rationale: 'Built and operated RAG in production.',
  citations: [citation],
  note: null,
};
const result = {
  requirements: [assessment],
  strengths: ['Production RAG'],
  concerns: [],
  summary: 'Strong evidence for the AI requirements.',
};

describe('scorecard results', () => {
  it('accept a result whose ratings cite verified quotes', () => {
    expect(ScorecardResultSchema.parse(result)).toEqual(result);
  });

  it('accept an assessment downgraded after its citations failed verification', () => {
    const downgraded = { ...assessment, rating: 'unclear', citations: [], note: 'citation_failed' };

    expect(ScorecardResultSchema.parse({ ...result, requirements: [downgraded] })).toBeTruthy();
  });

  it.each([
    ['an unknown rating', { ...assessment, rating: 'excellent' }],
    [
      'more than three citations',
      { ...assessment, citations: [citation, citation, citation, citation] },
    ],
    [
      'a quote shorter than 8 characters',
      { ...assessment, citations: [{ ...citation, quote: 'pgvec' }] },
    ],
    ['a malformed ref', { ...assessment, citations: [{ ...citation, ref: 'C1-3' }] }],
    ['a rationale over 300 characters', { ...assessment, rationale: 'x'.repeat(301) }],
  ])('reject an assessment with %s', (_label, bad) => {
    expect(ScorecardResultSchema.safeParse({ ...result, requirements: [bad] }).success).toBe(false);
  });

  it.each([
    ['four strengths', { ...result, strengths: ['a', 'b', 'c', 'd'] }],
    ['four concerns', { ...result, concerns: ['a', 'b', 'c', 'd'] }],
    ['a summary over 400 characters', { ...result, summary: 'x'.repeat(401) }],
  ])('reject a result with %s', (_label, bad) => {
    expect(ScorecardResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe('agent traces', () => {
  it('record tool calls by reference, without resume text', () => {
    const trace = [
      {
        step: 1,
        tool: 'search_resume',
        args: { query: 'retrieval augmented generation', requirementId: 'R4' },
        returnedRefs: ['C01#3', 'C01#4'],
        latencyMs: 812,
        tokens: { input: 5200, output: 64, cached: 4096 },
      },
      {
        step: 1,
        tool: 'read_section',
        args: { section: 'projects' },
        returnedRefs: [],
        latencyMs: 15,
        tokens: null,
      },
    ];

    expect(AgentTraceSchema.parse(trace)).toEqual(trace);
  });

  it('reject an unknown tool, because the agent has exactly two', () => {
    const step = {
      step: 1,
      tool: 'send_email',
      args: {},
      returnedRefs: [],
      latencyMs: 1,
      tokens: null,
    };

    expect(AgentTraceSchema.safeParse([step]).success).toBe(false);
  });
});

describe('scorecard models', () => {
  it('name the model behind each stage', () => {
    const models = { agent: 'gemini-flash-lite', synthesis: 'gemini-flash' };

    expect(ScorecardModelsSchema.parse(models)).toEqual(models);
  });
});
