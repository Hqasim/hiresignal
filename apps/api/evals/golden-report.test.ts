import { describe, expect, it } from 'vitest';

import { formatGoldenReport, type GoldenRun, summarizeGoldenRuns } from './golden-report';

const settings = { k: 5, keywordMatch: 'any', similarityFloor: 0.5 } as const;

function run(overrides: Partial<GoldenRun> & Pick<GoldenRun, 'id'>): GoldenRun {
  return {
    expected: ['C01'],
    ranked: { all: [], any: ['C01'], off: ['C02', 'C01'] },
    bestSimilarity: 0.7,
    candidates: 1,
    answer: null,
    ...overrides,
  };
}

const runs: GoldenRun[] = [
  run({ id: 'Q01' }),
  run({ id: 'Q02', expected: ['C09'], bestSimilarity: 0.45 }),
  run({
    id: 'X01',
    expected: [],
    ranked: { all: [], any: ['C05'], off: ['C05'] },
    bestSimilarity: 0.52,
  }),
  run({ id: 'X02', expected: [], ranked: { all: [], any: [], off: [] }, bestSimilarity: null }),
];

describe('summarizeGoldenRuns', () => {
  it('scores each keyword mode over the answerable questions only', () => {
    const { byMode } = summarizeGoldenRuns(runs, settings);

    expect(byMode.any).toEqual({ questions: 2, recall: 0.5, mrr: 0.5 });
    expect(byMode.off).toEqual({ questions: 2, recall: 0.5, mrr: 0.25 });
    expect(byMode.all).toEqual({ questions: 2, recall: 0, mrr: 0 });
  });

  it('shows where the floor splits answerable from out-of-scope questions', () => {
    expect(summarizeGoldenRuns(runs, settings).floor).toEqual({
      answerableMin: 0.45,
      outOfScopeMax: 0.52,
      answerableBelowFloor: ['Q02'],
      outOfScopeAtOrAboveFloor: ['X01'],
    });
  });
});

describe('formatGoldenReport', () => {
  it('prints one row per question, the mode table and the floor check, without question text', () => {
    const report = formatGoldenReport(
      [
        run({
          id: 'Q01',
          answer: {
            outcome: 'answered',
            routedReason: 'default',
            citations: 2,
            invalidCitations: 1,
          },
        }),
        ...runs.slice(1),
      ],
      settings,
    );

    expect(report).toContain('Q01  C01');
    expect(report).toContain('answered  default  2 (1 bad)');
    expect(report).toMatch(/any \(ask\)\s+0\.500\s+0\.500\s+2/);
    expect(report).toContain(
      'Similarity floor 0.50: lowest answerable 0.450, highest out of scope 0.520',
    );
    expect(report).toContain('answerable below the floor: Q02');
    expect(report).toContain('out of scope at or above the floor: X01');
  });
});
