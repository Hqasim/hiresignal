import { describe, expect, it } from 'vitest';

import { type CandidateAlias, CandidateAliasSchema } from '../src/domain/candidates/candidate';
import { ChunkRefSchema } from '../src/domain/candidates/chunk-ref';
import type { EvidenceChunk } from '../src/domain/citations/verify-citation';
import type { Requirement } from '../src/domain/jobs/job';
import { type ScorecardCase, summarizeScorecards } from './scorecard-suite';

const REQUIREMENTS: Requirement[] = [
  { id: 'R1', text: 'TypeScript and React', kind: 'must', weight: 3 },
  { id: 'R2', text: 'Mentoring', kind: 'nice', weight: 1 },
];

const RESUME = '# [PERSON_1]\n\n## Experience\n- Built React apps in TypeScript for six years.\n';
const CONTENT = '- Built React apps in TypeScript for six years.';
const START = RESUME.indexOf(CONTENT);
const QUOTE = 'Built React apps in TypeScript';
const QUOTE_START = RESUME.indexOf(QUOTE);

function alias(value: string): CandidateAlias {
  return CandidateAliasSchema.parse(value);
}

function evidence(ref = 'C01#0'): ReadonlyMap<string, EvidenceChunk> {
  return new Map([
    [
      ref,
      {
        ref: ChunkRefSchema.parse(ref),
        alias: alias(ref.slice(0, 3)),
        section: 'Experience',
        content: CONTENT,
        startOffset: START,
      },
    ],
  ]);
}

function citation(overrides: Partial<{ quote: string; start: number; ref: string }> = {}) {
  const quote = overrides.quote ?? QUOTE;
  const start = overrides.start ?? QUOTE_START;
  return {
    ref: overrides.ref ?? 'C01#0',
    section: 'Experience',
    quote,
    span: { start, end: start + quote.length },
  };
}

const STRONG_R1 = {
  requirementId: 'R1',
  rating: 'strong',
  rationale: 'r',
  citations: [citation()],
  note: null,
};
const NONE_R2 = { requirementId: 'R2', rating: 'none', rationale: 'r', citations: [], note: null };

/** C01 with a scorecard that rates `requirements`; R1 strong and R2 none score 75. */
function scored(
  overrides: Partial<ScorecardCase> = {},
  requirements: unknown[] = [STRONG_R1, NONE_R2],
  score = 75,
): ScorecardCase {
  return {
    alias: alias('C01'),
    quarantined: false,
    redactedResume: RESUME,
    evidence: evidence(),
    scorecard: {
      score,
      mustHavesMet: 1,
      result: { requirements, strengths: [], concerns: [], summary: 's' },
    },
    ...overrides,
  };
}

function withRequirements(requirements: unknown[], score = 75): ScorecardCase {
  return scored({}, requirements, score);
}

describe('summarizeScorecards', () => {
  it('passes every check for a scorecard whose evidence verifies and whose score recomputes', () => {
    const summary = summarizeScorecards(REQUIREMENTS, [scored()]);

    expect(summary.coverage).toEqual({ passed: 1, total: 1, rate: 1 });
    expect(summary.schema).toEqual({ passed: 1, total: 1, rate: 1 });
    expect(summary.citations).toEqual({ passed: 1, total: 1, rate: 1 });
    expect(summary.evidence).toEqual({ passed: 1, total: 1, rate: 1 });
    expect(summary.scores).toEqual({ passed: 1, total: 1, rate: 1 });
    expect(summary.failures).toEqual([]);
  });

  it('expects no scorecard for a quarantined candidate, and one for everybody else', () => {
    const summary = summarizeScorecards(REQUIREMENTS, [
      scored({ alias: alias('C06'), quarantined: true, scorecard: null }),
      scored({ alias: alias('C07'), quarantined: true }),
      scored({ alias: alias('C08'), scorecard: null }),
    ]);

    expect(summary.coverage).toEqual({ passed: 1, total: 3, rate: 1 / 3 });
    expect(summary.failures).toEqual([
      { alias: 'C07', check: 'coverage' },
      { alias: 'C08', check: 'coverage' },
    ]);
  });

  it.each([
    {
      name: 'a result that fails the schema',
      requirements: [{ requirementId: 'R1', rating: 'excellent' }],
    },
    {
      name: 'a requirement missing from the result',
      requirements: [
        { requirementId: 'R1', rating: 'none', rationale: 'r', citations: [], note: null },
      ],
    },
    {
      name: 'a requirement rated twice',
      requirements: [
        { requirementId: 'R1', rating: 'none', rationale: 'r', citations: [], note: null },
        { requirementId: 'R1', rating: 'none', rationale: 'r', citations: [], note: null },
        { requirementId: 'R2', rating: 'none', rationale: 'r', citations: [], note: null },
      ],
    },
    {
      name: 'a requirement the job does not have',
      requirements: [
        { requirementId: 'R1', rating: 'none', rationale: 'r', citations: [], note: null },
        { requirementId: 'R2', rating: 'none', rationale: 'r', citations: [], note: null },
        { requirementId: 'R9', rating: 'none', rationale: 'r', citations: [], note: null },
      ],
    },
  ])('fails the schema check for $name, and skips the other checks', ({ requirements }) => {
    const summary = summarizeScorecards(REQUIREMENTS, [withRequirements(requirements)]);

    expect(summary.schema).toEqual({ passed: 0, total: 1, rate: 0 });
    expect(summary.citations.total).toBe(0);
    expect(summary.scores.total).toBe(0);
    expect(summary.failures).toEqual([{ alias: 'C01', check: 'schema' }]);
  });

  it.each([
    {
      name: 'a quote that is not in the chunk',
      cite: citation({ quote: 'Built Vue apps in Go code' }),
    },
    { name: 'a span that selects other text', cite: citation({ start: QUOTE_START + 1 }) },
    { name: 'a ref that is not in the evidence', cite: citation({ ref: 'C01#5' }) },
    { name: "another candidate's ref", cite: citation({ ref: 'C02#0' }) },
  ])('fails the citation and evidence checks for $name', ({ cite }) => {
    const summary = summarizeScorecards(REQUIREMENTS, [
      withRequirements([
        { requirementId: 'R1', rating: 'strong', rationale: 'r', citations: [cite], note: null },
        { requirementId: 'R2', rating: 'none', rationale: 'r', citations: [], note: null },
      ]),
    ]);

    expect(summary.citations).toEqual({ passed: 0, total: 1, rate: 0 });
    expect(summary.evidence).toEqual({ passed: 0, total: 1, rate: 0 });
    expect(summary.failures).toEqual([
      { alias: 'C01', check: 'citations' },
      { alias: 'C01', check: 'evidence' },
    ]);
  });

  it('fails the evidence check for a partial rating with no citation', () => {
    const summary = summarizeScorecards(REQUIREMENTS, [
      withRequirements([STRONG_R1, { ...NONE_R2, rating: 'partial' }], 88),
    ]);

    expect(summary.evidence).toEqual({ passed: 1, total: 2, rate: 0.5 });
    expect(summary.scores.rate).toBe(1);
  });

  it('fails the score check when the stored score is not what the ratings compute', () => {
    const summary = summarizeScorecards(REQUIREMENTS, [
      withRequirements([STRONG_R1, NONE_R2], 100),
    ]);

    expect(summary.scores).toEqual({ passed: 0, total: 1, rate: 0 });
    expect(summary.failures).toEqual([{ alias: 'C01', check: 'scores' }]);
  });

  it('reports null rates when nothing was checked', () => {
    const summary = summarizeScorecards(REQUIREMENTS, []);

    expect(summary.coverage.rate).toBeNull();
    expect(summary.citations.rate).toBeNull();
  });
});
