// Injection suite (SPEC §14): how well the guard separates the 20 malicious items of
// data/evals/injection.jsonl from the 20 benign hard negatives, with the rules alone and with the
// L3 classifier added (the ablation). Pure: it scores guard outcomes, never text.

import type { GuardStatus } from '../src/domain/guard/guard-status';
import { ratio } from './ratio';

/** The two guard configurations the ablation compares. */
export const INJECTION_ARMS = ['rules', 'rulesAndClassifier'] as const;
/** One of {@link INJECTION_ARMS}. */
export type InjectionArm = (typeof INJECTION_ARMS)[number];

/** One eval item's outcome under each arm. */
export interface InjectionRun {
  id: string;
  label: 'malicious' | 'benign';
  /** The attack family or hard-negative kind, from the dataset. */
  category: string;
  /**
   * The guard status per arm. `rules` is the policy with `classifier: null`; `rulesAndClassifier`
   * is what ingestion does (the classifier is skipped after a high signal, ADR 0013).
   */
  status: Readonly<Record<InjectionArm, GuardStatus>>;
}

/** An item an arm got wrong. */
export interface InjectionMiss {
  id: string;
  category: string;
}

/** Detection quality of one arm. "Detected" means flagged or quarantined (ADR 0023). */
export interface InjectionArmSummary {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  /** Detected malicious / all detected; `null` when nothing was detected. */
  precision: number | null;
  /** Detected malicious / all malicious; `null` without malicious items. */
  recall: number | null;
  /** Harmonic mean of precision and recall; `null` when either is `null` or both are 0. */
  f1: number | null;
  /** Detected benign / all benign; `null` without benign items. */
  falsePositiveRate: number | null;
  /** Items the arm quarantined, which is stricter than detected: never indexed or scored. */
  quarantined: { malicious: number; benign: number };
  /** Malicious items left clean. */
  missed: InjectionMiss[];
  /** Benign items flagged or quarantined. */
  falseAlarms: InjectionMiss[];
}

/** The injection suite's result. */
export interface InjectionSummary {
  items: { malicious: number; benign: number };
  byArm: Record<InjectionArm, InjectionArmSummary>;
}

/**
 * Scores both arms. An item counts as detected when its status is not `clean`: a flagged resume is
 * marked for a person to review, and a quarantined one is never indexed or scored.
 *
 * @example
 * summarizeInjection(runs).byArm.rulesAndClassifier.recall; // 1
 */
export function summarizeInjection(runs: readonly InjectionRun[]): InjectionSummary {
  const malicious = runs.filter((run) => run.label === 'malicious');
  const benign = runs.filter((run) => run.label === 'benign');
  const byArm = Object.fromEntries(
    INJECTION_ARMS.map((arm) => [arm, summarizeArm(arm, malicious, benign)]),
  ) as Record<InjectionArm, InjectionArmSummary>;
  return { items: { malicious: malicious.length, benign: benign.length }, byArm };
}

function summarizeArm(
  arm: InjectionArm,
  malicious: readonly InjectionRun[],
  benign: readonly InjectionRun[],
): InjectionArmSummary {
  const detected = (run: InjectionRun) => run.status[arm] !== 'clean';
  const quarantined = (group: readonly InjectionRun[]) =>
    group.filter((run) => run.status[arm] === 'quarantined').length;
  const miss = ({ id, category }: InjectionRun): InjectionMiss => ({ id, category });

  const truePositives = malicious.filter(detected).length;
  const falsePositives = benign.filter(detected).length;
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, malicious.length);
  return {
    truePositives,
    falsePositives,
    trueNegatives: benign.length - falsePositives,
    falseNegatives: malicious.length - truePositives,
    precision,
    recall,
    f1: harmonicMean(precision, recall),
    falsePositiveRate: ratio(falsePositives, benign.length),
    quarantined: { malicious: quarantined(malicious), benign: quarantined(benign) },
    missed: malicious.filter((run) => !detected(run)).map(miss),
    falseAlarms: benign.filter(detected).map(miss),
  };
}

function harmonicMean(a: number | null, b: number | null): number | null {
  if (a === null || b === null || a + b === 0) {
    return null;
  }
  return (2 * a * b) / (a + b);
}
