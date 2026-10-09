// Retrieval metrics for the golden questions (SPEC §14, Retrieval suite). Pure functions over
// aliases, so the ask CLI, the integration test and the Phase 9 eval runner score retrieval the
// same way.

/** One question's retrieval, as the metrics see it. */
export interface RetrievalResult {
  /** Aliases that should surface; empty for an out-of-scope question, which the metrics skip. */
  expected: readonly string[];
  /** The alias of each retrieved chunk, best first. A candidate may appear more than once. */
  ranked: readonly string[];
}

/** Mean metrics over the answerable questions. */
export interface RetrievalSummary {
  /** How many questions with a non-empty `expected` were scored. */
  questions: number;
  /** Mean {@link recallAtK}. */
  recall: number;
  /** Mean reciprocal rank. */
  mrr: number;
}

/**
 * The share of expected candidates found among the candidates of the top `k` chunks
 * (SPEC §14: "expected candidate among the top 5 results' candidates").
 *
 * @throws RangeError if `expected` is empty, because recall is undefined without a target.
 *
 * @example
 * recallAtK({ expected: ['C01', 'C05'], ranked: ['C01', 'C01', 'C09', 'C05', 'C02'] }, 5); // 1
 */
export function recallAtK(result: RetrievalResult, k: number): number {
  if (result.expected.length === 0) {
    throw new RangeError('recall@k needs at least one expected candidate');
  }
  const top = new Set(result.ranked.slice(0, k));
  return result.expected.filter((alias) => top.has(alias)).length / result.expected.length;
}

/**
 * `1 / rank` of the first chunk that belongs to an expected candidate, or 0 if none does.
 *
 * @example
 * reciprocalRank({ expected: ['C09'], ranked: ['C01', 'C09'] }); // 0.5
 */
export function reciprocalRank(result: RetrievalResult): number {
  const index = result.ranked.findIndex((alias) => result.expected.includes(alias));
  return index === -1 ? 0 : 1 / (index + 1);
}

/**
 * Mean recall@k and MRR over the questions that expect someone. Out-of-scope questions are
 * judged by the insufficient-evidence path instead, so they are skipped here.
 *
 * @example
 * summarizeRetrieval(results, 5); // { questions: 20, recall: 0.9, mrr: 0.82 }
 */
export function summarizeRetrieval(
  results: readonly RetrievalResult[],
  k: number,
): RetrievalSummary {
  const scored = results.filter((result) => result.expected.length > 0);
  if (scored.length === 0) {
    return { questions: 0, recall: 0, mrr: 0 };
  }
  const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    questions: scored.length,
    recall: mean(scored.map((result) => recallAtK(result, k))),
    mrr: mean(scored.map(reciprocalRank)),
  };
}
