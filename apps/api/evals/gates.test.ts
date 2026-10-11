import { describe, expect, it } from 'vitest';

import { checkGates, type EvalResults } from './gates';
import { summarizeInjection } from './injection-suite';
import { summarizePii } from './pii-suite';
import { summarizeRetrievalSuite } from './retrieval-suite';
import { summarizeScorecards } from './scorecard-suite';

const PASSING: EvalResults = {
  retrieval: summarizeRetrievalSuite(
    [
      {
        id: 'Q01',
        expected: ['C01'],
        ranked: { all: ['C01'], any: ['C01'], off: ['C02', 'C01'] },
        bestSimilarity: 0.7,
        candidates: 1,
        answer: null,
      },
    ],
    { k: 5, keywordMatch: 'any', similarityFloor: 0.65 },
  ),
  injection: summarizeInjection([
    {
      id: 'M01',
      label: 'malicious',
      category: 'x',
      status: { rules: 'clean', rulesAndClassifier: 'flagged' },
    },
    {
      id: 'B01',
      label: 'benign',
      category: 'y',
      status: { rules: 'flagged', rulesAndClassifier: 'clean' },
    },
  ]),
  pii: summarizePii([{ id: 'P01', entities: [{ type: 'EMAIL', leaked: false }] }], []),
  scorecards: summarizeScorecards([], []),
};

describe('checkGates', () => {
  it('checks the hybrid mode ask uses, and the rules + classifier arm', () => {
    const gates = checkGates(PASSING);

    expect(gates.slice(0, 5)).toEqual([
      {
        suite: 'Retrieval',
        metric: 'recall@5 (any)',
        value: 1,
        comparison: 'atLeast',
        threshold: 0.95,
        unit: 'rate',
        passed: true,
      },
      {
        suite: 'Retrieval',
        metric: 'MRR (any)',
        value: 1,
        comparison: 'atLeast',
        threshold: 0.9,
        unit: 'rate',
        passed: true,
      },
      {
        suite: 'Injection',
        metric: 'malicious recall (rules + classifier)',
        value: 1,
        comparison: 'atLeast',
        threshold: 1,
        unit: 'rate',
        passed: true,
      },
      {
        suite: 'Injection',
        metric: 'benign false-positive rate (rules + classifier)',
        value: 0,
        comparison: 'atMost',
        threshold: 0.05,
        unit: 'rate',
        passed: true,
      },
      {
        suite: 'PII',
        metric: 'leaked entities',
        value: 0,
        comparison: 'atMost',
        threshold: 0,
        unit: 'count',
        passed: true,
      },
    ]);
  });

  it('fails a gate whose value is undefined, so an empty dataset cannot pass', () => {
    const scorecardGates = checkGates(PASSING).filter((gate) => gate.suite === 'Scorecards');

    expect(scorecardGates.map((gate) => [gate.metric, gate.value, gate.passed])).toEqual([
      ['coverage', null, false],
      ['schema', null, false],
      ['citations', null, false],
      ['evidence', null, false],
      ['scores', null, false],
    ]);
  });

  it('fails retrieval when no question is answerable', () => {
    const retrieval = summarizeRetrievalSuite([], {
      k: 5,
      keywordMatch: 'any',
      similarityFloor: 0.65,
    });

    expect(
      checkGates({ ...PASSING, retrieval })
        .slice(0, 2)
        .map((gate) => gate.value),
    ).toEqual([null, null]);
  });

  it('fails the PII gate on a single leak', () => {
    const pii = summarizePii([{ id: 'P01', entities: [{ type: 'EMAIL', leaked: true }] }], []);

    expect(checkGates({ ...PASSING, pii }).find((gate) => gate.suite === 'PII')).toMatchObject({
      value: 1,
      passed: false,
    });
  });

  it('passes a false-positive rate exactly at the gate, and fails one just above it', () => {
    const benign = (id: string, flagged: boolean) =>
      ({
        id,
        label: 'benign',
        category: 'y',
        status: { rules: 'clean', rulesAndClassifier: flagged ? 'flagged' : 'clean' },
      }) as const;
    const atGate = Array.from({ length: 20 }, (_, i) => benign(`B${String(i)}`, i === 0));
    const above = Array.from({ length: 19 }, (_, i) => benign(`B${String(i)}`, i === 0));
    const fpr = (runs: typeof atGate) =>
      checkGates({ ...PASSING, injection: summarizeInjection(runs) })[3];

    expect(fpr(atGate)).toMatchObject({ value: 0.05, passed: true });
    expect(fpr(above)?.passed).toBe(false);
  });
});
