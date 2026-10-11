import type { InjectionSummary } from './injection-suite';
import type { PiiSummary } from './pii-suite';
import type { RetrievalSuiteSummary } from './retrieval-suite';
import { SCORECARD_CHECKS, type ScorecardSummary } from './scorecard-suite';
import {
  INJECTION_THRESHOLDS,
  PII_THRESHOLDS,
  RETRIEVAL_THRESHOLDS,
  SCORECARD_THRESHOLDS,
} from './thresholds';

/** Every suite's result: what `npm run eval` measures. */
export interface EvalResults {
  retrieval: RetrievalSuiteSummary;
  injection: InjectionSummary;
  pii: PiiSummary;
  scorecards: ScorecardSummary;
}

/** The suites, in report order. */
export type EvalSuite = 'Retrieval' | 'Injection' | 'PII' | 'Scorecards';

/** One gate checked against a result. */
export interface GateResult {
  suite: EvalSuite;
  metric: string;
  /** The measured value, or `null` when it is undefined (for example, an empty set). */
  value: number | null;
  comparison: 'atLeast' | 'atMost';
  threshold: number;
  /** How to show the value: a rate between 0 and 1, or a count. */
  unit: 'rate' | 'count';
  /** A `null` value never passes: a gate needs evidence. */
  passed: boolean;
}

/**
 * Checks every result against `thresholds.ts`, in report order.
 *
 * @example
 * const gates = checkGates(results);
 * if (gates.some((gate) => !gate.passed)) process.exitCode = 1;
 */
export function checkGates(results: EvalResults): GateResult[] {
  const { retrieval, injection, pii, scorecards } = results;
  const hybrid = retrieval.byMode[retrieval.askMode];
  const withClassifier = injection.byArm.rulesAndClassifier;
  return [
    atLeast(
      'Retrieval',
      `recall@${String(retrieval.k)} (${retrieval.askMode})`,
      hybrid.questions === 0 ? null : hybrid.recall,
      RETRIEVAL_THRESHOLDS.recallAtK,
    ),
    atLeast(
      'Retrieval',
      `MRR (${retrieval.askMode})`,
      hybrid.questions === 0 ? null : hybrid.mrr,
      RETRIEVAL_THRESHOLDS.mrr,
    ),
    atLeast(
      'Injection',
      'malicious recall (rules + classifier)',
      withClassifier.recall,
      INJECTION_THRESHOLDS.maliciousRecall,
    ),
    atMost(
      'Injection',
      'benign false-positive rate (rules + classifier)',
      withClassifier.falsePositiveRate,
      INJECTION_THRESHOLDS.benignFalsePositiveRate,
    ),
    { ...atMost('PII', 'leaked entities', pii.leaks, PII_THRESHOLDS.maxLeaks), unit: 'count' },
    ...SCORECARD_CHECKS.map((check) =>
      atLeast('Scorecards', check, scorecards[check].rate, SCORECARD_THRESHOLDS[check]),
    ),
  ];
}

function atLeast(
  suite: EvalSuite,
  metric: string,
  value: number | null,
  threshold: number,
): GateResult {
  const passed = value !== null && value >= threshold;
  return { suite, metric, value, comparison: 'atLeast', threshold, unit: 'rate', passed };
}

function atMost(
  suite: EvalSuite,
  metric: string,
  value: number | null,
  threshold: number,
): GateResult {
  const passed = value !== null && value <= threshold;
  return { suite, metric, value, comparison: 'atMost', threshold, unit: 'rate', passed };
}
