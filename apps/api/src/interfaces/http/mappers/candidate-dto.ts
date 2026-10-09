import type {
  CandidateDetail as CandidateDetailDto,
  CandidateSummary,
  GuardSignal as GuardSignalDto,
} from '@hiresignal/contracts';

import type { CandidateDetail } from '../../../application/candidates/get-candidate-detail';
import type { RankedCandidate } from '../../../application/ports/candidate-repository';
import type { GuardSignal } from '../../../domain/guard/guard-verdict';
import { toScorecardDto } from './scorecard-dto';

/**
 * Maps a ranked row to its summary. The name stays hidden until a person shortlists the candidate.
 *
 * @example
 * toCandidateSummary(row); // { id, alias: 'C04', displayName: null, score: 62, … }
 */
export function toCandidateSummary(row: RankedCandidate): CandidateSummary {
  return {
    id: row.id,
    alias: row.alias,
    displayName: row.shortlistedAt === null ? null : row.displayName,
    guardStatus: row.guardStatus,
    shortlisted: row.shortlistedAt !== null,
    score: row.latestScore?.score ?? null,
    mustHaves:
      row.latestScore === null
        ? null
        : { met: row.latestScore.mustHavesMet, total: row.latestScore.mustHavesTotal },
  };
}

/**
 * Maps a candidate's detail: summary fields, redacted resume, redaction counts, the guard verdict
 * with spans, and the latest scorecard joined to the rubric.
 *
 * @example
 * toCandidateDetail(await getCandidateDetail(id));
 */
export function toCandidateDetail({
  candidate,
  job,
  scorecard,
}: CandidateDetail): CandidateDetailDto {
  return {
    ...toCandidateSummary({
      ...candidate,
      latestScore:
        scorecard === null
          ? null
          : {
              score: scorecard.score,
              mustHavesMet: scorecard.mustHavesMet,
              mustHavesTotal: scorecard.mustHavesTotal,
            },
    }),
    redactedResume: candidate.redactedResume,
    redactionSummary: candidate.redactionSummary.map(({ type, count }) => ({ type, count })),
    guard: {
      status: candidate.guardStatus,
      signals: candidate.guardVerdict.signals.map(toSignalDto),
      dismissed: candidate.guardVerdict.dismissed.map(toSignalDto),
      classifier: candidate.guardVerdict.classifier,
    },
    scorecard: scorecard === null ? null : toScorecardDto(scorecard, job),
  };
}

function toSignalDto(signal: GuardSignal): GuardSignalDto {
  return {
    id: signal.id,
    layer: signal.layer,
    severity: signal.severity,
    label: signal.label,
    span: signal.span === null ? null : { start: signal.span.start, end: signal.span.end },
    excerpt: signal.excerpt,
  };
}
