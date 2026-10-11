// Retrieval suite (SPEC §14): recall@k and MRR of the golden questions per keyword-match mode
// (the vector-only vs hybrid ablation, ADR 0008), where the similarity floor falls, and how the
// asks ended. Pure: it scores `GoldenRun`s, which hold ids and numbers only.

import {
  type GoldenReportSettings,
  type GoldenRun,
  type GoldenSummary,
  type KeywordMode,
  summarizeGoldenRuns,
} from './golden-report';

/**
 * The k of recall@k (SPEC §14): an expected candidate counts as found when one of the top 5
 * retrieved chunks is theirs. Ask sends the model more (`ASK_TOP_K`), so 5 is the stricter test.
 */
export const RECALL_AT_K = 5;

/** How the asks ended, split by whether the question has an answer in the pool. */
export interface AnswerSummary {
  answerable: number;
  /** Answerable questions that came back `answered`, with at least one verified citation. */
  answered: number;
  outOfScope: number;
  /** Out-of-scope questions that came back as insufficient evidence (any outcome but `answered`). */
  declined: number;
  /** Verified citations across all answers. */
  citations: number;
  /** Citations the verifier dropped. */
  invalidCitations: number;
}

/** The retrieval suite's result. */
export interface RetrievalSuiteSummary extends GoldenSummary {
  /** The recall@k cut-off. */
  k: number;
  /** The mode ask uses, which the gates read. */
  askMode: KeywordMode;
  /** `SIMILARITY_FLOOR`, which the floor check measured against. */
  similarityFloor: number;
  /** `null` for a retrieval-only run. */
  answers: AnswerSummary | null;
}

/**
 * Scores the golden runs, and the answers when the runs include them.
 *
 * @example
 * summarizeRetrievalSuite(runs, { k: 5, keywordMatch: 'any', similarityFloor: 0.65 }).byMode.any;
 */
export function summarizeRetrievalSuite(
  runs: readonly GoldenRun[],
  settings: GoldenReportSettings,
): RetrievalSuiteSummary {
  return {
    ...summarizeGoldenRuns(runs, settings),
    k: settings.k,
    askMode: settings.keywordMatch,
    similarityFloor: settings.similarityFloor,
    answers: runs.some((run) => run.answer === null) ? null : summarizeAnswers(runs),
  };
}

function summarizeAnswers(runs: readonly GoldenRun[]): AnswerSummary {
  const answerable = runs.filter((run) => run.expected.length > 0);
  const outOfScope = runs.filter((run) => run.expected.length === 0);
  const answered = (run: GoldenRun) =>
    run.answer?.outcome === 'answered' && run.answer.citations > 0;
  return {
    answerable: answerable.length,
    answered: answerable.filter(answered).length,
    outOfScope: outOfScope.length,
    declined: outOfScope.filter((run) => run.answer?.outcome !== 'answered').length,
    citations: runs.reduce((sum, run) => sum + (run.answer?.citations ?? 0), 0),
    invalidCitations: runs.reduce((sum, run) => sum + (run.answer?.invalidCitations ?? 0), 0),
  };
}
