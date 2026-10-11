import { describe, expect, it } from 'vitest';

import {
  GENERATED_END,
  GENERATED_START,
  markdownTable,
  renderEvalReport,
  replaceGeneratedBlock,
} from './eval-report';
import { checkGates, type EvalResults } from './gates';
import { summarizeInjection } from './injection-suite';
import { summarizePii } from './pii-suite';
import { summarizeRetrievalSuite } from './retrieval-suite';
import { summarizeScorecards } from './scorecard-suite';

const META = { date: '2026-10-12', mode: 'replay' } as const;

const RESULTS: EvalResults = {
  retrieval: summarizeRetrievalSuite(
    [
      {
        id: 'Q01',
        expected: ['C01'],
        ranked: { all: ['C01'], any: ['C01'], off: ['C02', 'C01'] },
        bestSimilarity: 0.7,
        candidates: 2,
        answer: { outcome: 'answered', routedReason: 'default', citations: 2, invalidCitations: 0 },
      },
      {
        id: 'X01',
        expected: [],
        ranked: { all: [], any: ['C03'], off: ['C03'] },
        bestSimilarity: 0.6,
        candidates: 1,
        answer: { outcome: 'below-floor', routedReason: null, citations: 0, invalidCitations: 0 },
      },
    ],
    { k: 5, keywordMatch: 'any', similarityFloor: 0.65 },
  ),
  injection: summarizeInjection([
    {
      id: 'M01',
      label: 'malicious',
      category: 'social-engineering',
      status: { rules: 'clean', rulesAndClassifier: 'quarantined' },
    },
    {
      id: 'B01',
      label: 'benign',
      category: 'security-vocabulary',
      status: { rules: 'flagged', rulesAndClassifier: 'clean' },
    },
  ]),
  pii: summarizePii(
    [{ id: 'P01', entities: [{ type: 'EMAIL', leaked: false }] }],
    [{ alias: 'C01', nameWords: 2, leakedNameWords: 0 }],
  ),
  scorecards: summarizeScorecards([], []),
};

describe('markdownTable', () => {
  it('pads every cell to its column, as Prettier does', () => {
    expect(
      markdownTable([
        ['Arm', 'Recall'],
        ['Rules only', '0.900'],
      ]),
    ).toBe(
      ['| Arm        | Recall |', '| ---------- | ------ |', '| Rules only | 0.900  |'].join('\n'),
    );
  });

  it('keeps every column at least three wide', () => {
    expect(markdownTable([['ID'], ['Q1']])).toBe(['| ID  |', '| --- |', '| Q1  |'].join('\n'));
  });

  it('renders nothing without a header', () => {
    expect(markdownTable([])).toBe('');
  });
});

describe('renderEvalReport', () => {
  const report = renderEvalReport(RESULTS, checkGates(RESULTS), META);

  it('dates the run and gives the verdict before the details', () => {
    expect(report.split('\n')[0]).toBe(
      'As of 2026-10-12: `npm run eval` in replay mode, 5 of 10 gates fail.',
    );
  });

  it('marks failing gates, shows undefined values as a dash and counts as integers', () => {
    expect(report).toContain('| Scorecards | coverage');
    expect(report).toMatch(/\| Scorecards \| coverage +\| – +\| ≥ 1\.000 \| FAIL +\|/);
    expect(report).toMatch(/\| PII +\| leaked entities +\| 0 +\| ≤ 0 +\| pass +\|/);
  });

  it('includes both ablations: every keyword-match mode and both guard arms', () => {
    expect(report).toContain('`off` (vector only)');
    expect(report).toContain('`any` (any keyword), ask');
    expect(report).toMatch(/\| Rules only \(L0–L2\) +\| 0\/1 +\| 0\.000/);
    expect(report).toMatch(/\| Rules \+ classifier \(L0–L3\) \| 1\/1 +\| 1\.000/);
    expect(report).toContain('- Rules only (L0–L2) missed: M01 (social-engineering).');
  });

  it('reports the floor check and how the asks ended', () => {
    expect(report).toContain('- Similarity floor 0.65: lowest answerable 0.700');
    expect(report).toContain(
      '1 of 1 answerable questions answered with verified citations (2 citations, 0 dropped). 1 of 1 out-of-scope',
    );
  });
});

describe('replaceGeneratedBlock', () => {
  const document = `# Evals\n\nMethod.\n\n${GENERATED_START}\n\nold results\n\n${GENERATED_END}\n\n## After\n`;

  it('replaces only what sits between the markers', () => {
    expect(replaceGeneratedBlock(document, 'new results\n')).toBe(
      `# Evals\n\nMethod.\n\n${GENERATED_START}\n\nnew results\n\n${GENERATED_END}\n\n## After\n`,
    );
  });

  it('refuses a document without both markers in order', () => {
    expect(() => replaceGeneratedBlock('# Evals\n', 'x')).toThrow(GENERATED_START);
    expect(() => replaceGeneratedBlock(`${GENERATED_END}\n${GENERATED_START}`, 'x')).toThrow();
  });
});
