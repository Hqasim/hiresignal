import { describe, expect, it } from 'vitest';

import type { GuardStatus } from '../src/domain/guard/guard-status';
import { type InjectionRun, summarizeInjection } from './injection-suite';

function run(
  id: string,
  label: InjectionRun['label'],
  rules: GuardStatus,
  rulesAndClassifier: GuardStatus,
  category = 'instruction-override',
): InjectionRun {
  return { id, label, category, status: { rules, rulesAndClassifier } };
}

describe('summarizeInjection', () => {
  it('counts flagged and quarantined as detected, and clean as missed', () => {
    const summary = summarizeInjection([
      run('M01', 'malicious', 'quarantined', 'quarantined'),
      run('M02', 'malicious', 'flagged', 'quarantined'),
      run('M03', 'malicious', 'clean', 'flagged', 'social-engineering'),
      run('B01', 'benign', 'flagged', 'clean'),
      run('B02', 'benign', 'clean', 'clean'),
    ]);

    expect(summary.items).toEqual({ malicious: 3, benign: 2 });
    expect(summary.byArm.rules).toMatchObject({
      truePositives: 2,
      falseNegatives: 1,
      falsePositives: 1,
      trueNegatives: 1,
      recall: 2 / 3,
      precision: 2 / 3,
      falsePositiveRate: 0.5,
      quarantined: { malicious: 1, benign: 0 },
      missed: [{ id: 'M03', category: 'social-engineering' }],
      falseAlarms: [{ id: 'B01', category: 'instruction-override' }],
    });
    expect(summary.byArm.rulesAndClassifier).toMatchObject({
      truePositives: 3,
      falseNegatives: 0,
      falsePositives: 0,
      trueNegatives: 2,
      recall: 1,
      precision: 1,
      f1: 1,
      falsePositiveRate: 0,
      quarantined: { malicious: 2, benign: 0 },
      missed: [],
      falseAlarms: [],
    });
  });

  it('computes F1 as the harmonic mean of precision and recall', () => {
    const { f1 } = summarizeInjection([
      run('M01', 'malicious', 'flagged', 'flagged'),
      run('M02', 'malicious', 'clean', 'clean'),
      run('B01', 'benign', 'flagged', 'flagged'),
    ]).byArm.rules;

    // precision 1/2, recall 1/2
    expect(f1).toBe(0.5);
  });

  it('reports null, not zero, for a rate whose denominator is empty', () => {
    const summary = summarizeInjection([run('B01', 'benign', 'clean', 'clean')]);

    expect(summary.byArm.rules).toMatchObject({
      recall: null,
      precision: null,
      f1: null,
      falsePositiveRate: 0,
    });
    expect(summarizeInjection([]).byArm.rules.falsePositiveRate).toBeNull();
  });

  it('gives F1 null when nothing is detected correctly', () => {
    const { f1, precision, recall } = summarizeInjection([
      run('M01', 'malicious', 'clean', 'clean'),
      run('B01', 'benign', 'flagged', 'flagged'),
    ]).byArm.rules;

    expect({ precision, recall, f1 }).toEqual({ precision: 0, recall: 0, f1: null });
  });
});
