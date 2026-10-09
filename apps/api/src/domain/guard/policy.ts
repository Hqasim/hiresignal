import { assertNever } from '../shared/assert-never';
import type { GuardStatus } from './guard-status';
import type { ClassifierVerdict, GuardSignal, GuardVerdict } from './guard-verdict';

/** What the guard layers found: L0–L2 signals and, when it ran, the L3 classifier's verdict. */
export interface GuardEvidence {
  signals: readonly GuardSignal[];
  /** `null` when the classifier didn't run (see {@link shouldRunClassifier}). */
  classifier: ClassifierVerdict | null;
}

/**
 * Policy thresholds. Passed in rather than imported because `domain/` can't read `config/`; the
 * composition root supplies `CLASSIFIER_QUARANTINE_CONFIDENCE`.
 */
export interface GuardThresholds {
  /** A `malicious` verdict at or above this confidence quarantines on its own. */
  quarantineConfidence: number;
}

/** The status to store, plus the verdict as `candidates.guard_verdict`. */
export interface GuardDecision {
  status: GuardStatus;
  verdict: GuardVerdict;
}

/**
 * Whether the L3 classifier needs to run. A high-severity signal quarantines the resume whatever
 * the classifier says, so the call is skipped: it saves quota, and a resume already known to carry
 * hidden instructions is never sent to a model at all (ADR 0013).
 *
 * @example
 * shouldRunClassifier([{ severity: 'high', … }]); // false
 */
export function shouldRunClassifier(signals: readonly GuardSignal[]): boolean {
  return !signals.some((signal) => signal.severity === 'high');
}

/**
 * The quarantine policy (SPEC §9.4, ADR 0013), pure and table-tested:
 *
 * - **Quarantined:** any high-severity signal, or a `malicious` verdict with confidence at or
 *   above `quarantineConfidence`.
 * - **Flagged:** a `suspicious` verdict, a `malicious` verdict below the threshold, or medium
 *   signals that the classifier didn't clear (it said something other than `benign`, or didn't
 *   run).
 * - **Clean:** otherwise. Medium signals the classifier judged benign move to `dismissed`, so a
 *   resume that says "built prompt-injection defenses" is kept, and a person can still see why
 *   the rules fired.
 *
 * @example
 * decideGuard({ signals: [], classifier: { verdict: 'malicious', confidence: 0.9, rationale } },
 *   { quarantineConfidence: 0.7 }).status; // 'quarantined'
 */
export function decideGuard(evidence: GuardEvidence, thresholds: GuardThresholds): GuardDecision {
  const { signals, classifier } = evidence;
  const keepAll = (status: GuardStatus): GuardDecision => ({
    status,
    verdict: { signals: [...signals], classifier, dismissed: [] },
  });

  if (!shouldRunClassifier(signals)) {
    return keepAll('quarantined');
  }
  if (classifier === null) {
    return keepAll(signals.length > 0 ? 'flagged' : 'clean');
  }
  switch (classifier.verdict) {
    case 'malicious':
      return keepAll(
        classifier.confidence >= thresholds.quarantineConfidence ? 'quarantined' : 'flagged',
      );
    case 'suspicious':
      return keepAll('flagged');
    case 'benign':
      return {
        status: 'clean',
        verdict: { signals: [], classifier, dismissed: [...signals] },
      };
    default:
      return assertNever(classifier.verdict);
  }
}
