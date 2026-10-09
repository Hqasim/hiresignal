import { describe, expect, it } from 'vitest';

import { recallAtK, reciprocalRank, summarizeRetrieval } from './retrieval-metrics';

describe('recallAtK', () => {
  it.each([
    { expected: ['C01'], ranked: ['C01'], k: 5, recall: 1 },
    { expected: ['C01', 'C05'], ranked: ['C01', 'C01', 'C09', 'C05'], k: 5, recall: 1 },
    {
      expected: ['C01', 'C05'],
      ranked: ['C01', 'C01', 'C09', 'C02', 'C04', 'C05'],
      k: 5,
      recall: 0.5,
    },
    { expected: ['C08'], ranked: ['C01', 'C02'], k: 5, recall: 0 },
    { expected: ['C08'], ranked: [], k: 5, recall: 0 },
  ])('finds $recall of $expected in the top $k of $ranked', ({ expected, ranked, k, recall }) => {
    expect(recallAtK({ expected, ranked }, k)).toBe(recall);
  });

  it('refuses a question that expects nobody', () => {
    expect(() => recallAtK({ expected: [], ranked: ['C01'] }, 5)).toThrow(RangeError);
  });
});

describe('reciprocalRank', () => {
  it.each([
    { expected: ['C09'], ranked: ['C09', 'C01'], rr: 1 },
    { expected: ['C09', 'C10'], ranked: ['C01', 'C02', 'C10'], rr: 1 / 3 },
    { expected: ['C09'], ranked: ['C01', 'C02'], rr: 0 },
  ])('is $rr for $expected in $ranked', ({ expected, ranked, rr }) => {
    expect(reciprocalRank({ expected, ranked })).toBe(rr);
  });
});

describe('summarizeRetrieval', () => {
  it('averages over answerable questions and skips out-of-scope ones', () => {
    const summary = summarizeRetrieval(
      [
        { expected: ['C01'], ranked: ['C01'] },
        { expected: ['C05'], ranked: ['C01', 'C05'] },
        { expected: [], ranked: ['C03'] },
      ],
      1,
    );

    expect(summary).toEqual({ questions: 2, recall: 0.5, mrr: 0.75 });
  });

  it('reports zeros when nothing can be scored', () => {
    expect(summarizeRetrieval([{ expected: [], ranked: [] }], 5)).toEqual({
      questions: 0,
      recall: 0,
      mrr: 0,
    });
  });
});
