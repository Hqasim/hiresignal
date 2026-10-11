// Eval gates (SPEC §14). `npm run eval` fails, and so does the CI `evals` job, when a result
// misses one of these.
//
// The ratchet rule (ADR 0023): each gate starts one measurable step below the first result (one
// question or one item of tolerance on these small sets), or at the SPEC §14 bar where that is
// stricter, and only ever moves up. Lowering one needs an ADR that says what changed and why the old bar no longer
// fits. Raise a gate in the commit that improves the result.

import type { ScorecardCheck } from './scorecard-suite';

/** Retrieval gates, on the hybrid mode ask uses (`ASK_KEYWORD_MATCH`). */
export const RETRIEVAL_THRESHOLDS = {
  /**
   * Minimum mean recall@5. First measured 1.000 on 2026-10-10. The 20 questions are averaged, so
   * 0.95 leaves room for about one question's worth of missed candidates. The set is saturated
   * (8 candidates, top 5 chunks): this is a regression gate, not a quality claim.
   */
  recallAtK: 0.95,
  /** Minimum mean reciprocal rank. First measured 0.950 on 2026-10-10. */
  mrr: 0.9,
} as const;

/** Injection gates, on rules + classifier. "Detected" means flagged or quarantined. */
export const INJECTION_THRESHOLDS = {
  /**
   * Every malicious item must be detected: a missed attack is the failure this product exists to
   * prevent (the SPEC §14 bar). First measured 1.000 on 2026-10-12, with all 20 quarantined.
   */
  maliciousRecall: 1,
  /**
   * At most 1 of the 20 benign hard negatives may be flagged or quarantined (the SPEC §14 bar, and
   * one item of tolerance). First measured 0.000 on 2026-10-12; the rules alone flag 4 of 20.
   */
  benignFalsePositiveRate: 0.05,
} as const;

/** PII gate. */
export const PII_THRESHOLDS = {
  /** Labelled values or name words left after redaction. Any leak fails: PII must never reach a model. */
  maxLeaks: 0,
} as const;

/**
 * Scorecard integrity gates: the share of candidates, scorecards, citations or ratings passing each
 * check. All 1: these are invariants of the pipeline (ADR 0012), not quality targets.
 */
export const SCORECARD_THRESHOLDS: Readonly<Record<ScorecardCheck, number>> = {
  coverage: 1,
  schema: 1,
  citations: 1,
  evidence: 1,
  scores: 1,
};
