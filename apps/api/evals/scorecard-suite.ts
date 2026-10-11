// Scorecard integrity suite (SPEC §14): re-checks every stored scorecard with the same pure code
// that produced it. Screening already verifies before saving (ADR 0012), so this is the invariant
// check on what the database actually holds: schema, citations, evidence behind each rating, and a
// score that recomputes. Pure: the eval wiring loads the rows.

import type { CandidateAlias } from '../src/domain/candidates/candidate';
import { type EvidenceChunk, verifyCitation } from '../src/domain/citations/verify-citation';
import type { Requirement } from '../src/domain/jobs/job';
import { computeScore } from '../src/domain/scoring/compute-score';
import {
  type Citation,
  type ScorecardResult,
  ScorecardResultSchema,
} from '../src/domain/scoring/scorecard';
import { ratio } from './ratio';

/** One candidate as stored after seeding. */
export interface ScorecardCase {
  alias: CandidateAlias;
  quarantined: boolean;
  redactedResume: string;
  /** The latest scorecard, with `result` as read back (re-parsed here), or `null` if none. */
  scorecard: { score: number; mustHavesMet: number; result: unknown } | null;
  /** The chunks the scorecard's citations name, keyed by ref. */
  evidence: ReadonlyMap<string, EvidenceChunk>;
}

/** The checks, in report order. */
export const SCORECARD_CHECKS = ['coverage', 'schema', 'citations', 'evidence', 'scores'] as const;
/** One of {@link SCORECARD_CHECKS}. */
export type ScorecardCheck = (typeof SCORECARD_CHECKS)[number];

/** How many items passed one check. */
export interface IntegrityCount {
  passed: number;
  total: number;
  /** `passed / total`, or `null` when nothing was checked. */
  rate: number | null;
}

/** The scorecard suite's result. */
export type ScorecardSummary = Record<ScorecardCheck, IntegrityCount> & {
  candidates: number;
  /** Each candidate and check that failed, at most once per pair. */
  failures: { alias: string; check: ScorecardCheck }[];
};

/**
 * Checks every candidate:
 *
 * - **coverage:** a non-quarantined candidate has a scorecard, a quarantined one has none
 * - **schema:** the result parses, and rates each of the job's requirements exactly once
 * - **citations:** each citation re-verifies against its chunk (`verifyCitation`), with the same
 *   quote and span, and the span selects the quote in the redacted resume
 * - **evidence:** each `strong` or `partial` rating has at least one valid citation
 * - **scores:** the stored score and must-haves equal `computeScore` on the stored ratings
 *
 * A scorecard that fails the schema check, or belongs to a quarantined candidate, is not checked
 * further.
 *
 * @example
 * summarizeScorecards(job.requirements, cases).citations.rate; // 1
 */
export function summarizeScorecards(
  requirements: readonly Requirement[],
  cases: readonly ScorecardCase[],
): ScorecardSummary {
  const counts = Object.fromEntries(
    SCORECARD_CHECKS.map((check) => [check, { passed: 0, total: 0 }]),
  ) as Record<ScorecardCheck, { passed: number; total: number }>;
  const failures: ScorecardSummary['failures'] = [];
  const tally = (item: ScorecardCase, check: ScorecardCheck, passed: number, total: number) => {
    counts[check].passed += passed;
    counts[check].total += total;
    if (passed < total) {
      failures.push({ alias: item.alias, check });
    }
  };

  for (const item of cases) {
    const covered = item.quarantined === (item.scorecard === null);
    tally(item, 'coverage', covered ? 1 : 0, 1);
    if (item.scorecard === null || item.quarantined) {
      // A quarantined candidate's scorecard is already a coverage failure; it should not exist.
      continue;
    }
    const result = parseResult(item.scorecard.result, requirements);
    tally(item, 'schema', result === null ? 0 : 1, 1);
    if (result === null) {
      continue;
    }
    const valid = (citation: Citation) => isValidCitation(citation, item);
    const citations = result.requirements.flatMap((assessment) => assessment.citations);
    tally(item, 'citations', citations.filter(valid).length, citations.length);
    const rated = result.requirements.filter(
      (assessment) => assessment.rating === 'strong' || assessment.rating === 'partial',
    );
    tally(
      item,
      'evidence',
      rated.filter((assessment) => assessment.citations.some(valid)).length,
      rated.length,
    );
    const recomputed = computeScore(requirements, result.requirements);
    const reproduced =
      recomputed.score === item.scorecard.score &&
      recomputed.mustHavesMet === item.scorecard.mustHavesMet;
    tally(item, 'scores', reproduced ? 1 : 0, 1);
  }

  const summary = Object.fromEntries(
    SCORECARD_CHECKS.map((check) => [
      check,
      { ...counts[check], rate: ratio(counts[check].passed, counts[check].total) },
    ]),
  ) as Record<ScorecardCheck, IntegrityCount>;
  return { ...summary, candidates: cases.length, failures };
}

function parseResult(value: unknown, requirements: readonly Requirement[]): ScorecardResult | null {
  const parsed = ScorecardResultSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const rated = parsed.data.requirements.map((assessment) => assessment.requirementId);
  const expected = requirements.map((requirement) => requirement.id);
  const exactlyOnce =
    rated.length === expected.length &&
    new Set(rated).size === rated.length &&
    expected.every((id) => rated.includes(id));
  return exactlyOnce ? parsed.data : null;
}

function isValidCitation(citation: Citation, item: ScorecardCase): boolean {
  const verified = verifyCitation(citation, item.evidence, item.alias);
  return (
    !('failure' in verified) &&
    verified.quote === citation.quote &&
    verified.span.start === citation.span.start &&
    verified.span.end === citation.span.end &&
    item.redactedResume.slice(citation.span.start, citation.span.end) === citation.quote
  );
}
