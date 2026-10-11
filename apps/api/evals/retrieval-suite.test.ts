import { describe, expect, it } from 'vitest';

import type { GoldenRun } from './golden-report';
import { summarizeRetrievalSuite } from './retrieval-suite';

const SETTINGS = { k: 5, keywordMatch: 'any', similarityFloor: 0.65 } as const;

function run(
  id: string,
  expected: string[],
  answer: GoldenRun['answer'],
  ranked: string[] = expected,
): GoldenRun {
  return {
    id,
    expected,
    ranked: { all: ranked, any: ranked, off: ranked },
    bestSimilarity: expected.length === 0 ? 0.5 : 0.7,
    candidates: new Set(ranked).size,
    answer,
  };
}

function answer(outcome: string, citations: number, invalidCitations = 0): GoldenRun['answer'] {
  return {
    outcome,
    routedReason: outcome === 'answered' ? 'default' : null,
    citations,
    invalidCitations,
  };
}

describe('summarizeRetrievalSuite', () => {
  it('scores retrieval per mode and counts how the asks ended', () => {
    const summary = summarizeRetrievalSuite(
      [
        run('Q01', ['C01'], answer('answered', 2, 1)),
        run('Q02', ['C02'], answer('answered', 0)),
        run('Q03', ['C03'], answer('unverified', 0)),
        run('X01', [], answer('below-floor', 0)),
        run('X02', [], answer('answered', 1)),
      ],
      SETTINGS,
    );

    expect(summary.k).toBe(5);
    expect(summary.askMode).toBe('any');
    expect(summary.byMode.any).toEqual({ questions: 3, recall: 1, mrr: 1 });
    expect(summary.answers).toEqual({
      answerable: 3,
      answered: 1,
      outOfScope: 2,
      declined: 1,
      citations: 3,
      invalidCitations: 1,
    });
  });

  it('has no answer summary for a retrieval-only run', () => {
    const summary = summarizeRetrievalSuite([run('Q01', ['C01'], null)], SETTINGS);

    expect(summary.answers).toBeNull();
    expect(summary.byMode.any.recall).toBe(1);
  });
});
