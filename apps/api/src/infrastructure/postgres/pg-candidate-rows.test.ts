import { describe, expect, it } from 'vitest';

import {
  CandidateRowSchema,
  RankedCandidateRowSchema,
  toCandidate,
  toRankedCandidate,
} from './pg-candidate-rows';

const createdAt = new Date('2026-10-08T00:00:00.000Z');
const row = {
  id: '6f1c2a6e-3c1b-4f7e-9a51-0d0b8f5c2a10',
  job_id: '0b7f5e2a-9d1c-4a3e-8f60-2c4d6e8f0a12',
  alias: 'C04',
  display_name: 'Sofia Martínez',
  source_hash: 'abc123',
  redacted_resume: 'Contact [EMAIL_1].',
  redaction_summary: [{ type: 'EMAIL', count: 1 }],
  guard_status: 'flagged',
  guard_verdict: { signals: [], classifier: null, dismissed: [] },
  shortlisted_at: null,
  created_at: createdAt,
};

describe('candidate rows', () => {
  it('map snake_case columns to the camelCase entity', () => {
    expect(toCandidate(CandidateRowSchema.parse(row))).toEqual({
      id: row.id,
      jobId: row.job_id,
      alias: 'C04',
      displayName: 'Sofia Martínez',
      sourceHash: 'abc123',
      redactedResume: 'Contact [EMAIL_1].',
      redactionSummary: [{ type: 'EMAIL', count: 1 }],
      guardStatus: 'flagged',
      guardVerdict: { signals: [], classifier: null, dismissed: [] },
      shortlistedAt: null,
      createdAt,
    });
  });

  it.each([
    ['a guard verdict missing its signals', { guard_verdict: { classifier: null, dismissed: [] } }],
    ['an unknown guard status', { guard_status: 'blocked' }],
    [
      'a redaction summary with a negative count',
      { redaction_summary: [{ type: 'EMAIL', count: -1 }] },
    ],
    ['a timestamp left as text', { created_at: '2026-10-08' }],
  ])('reject %s instead of passing bad data on', (_label, corruption) => {
    expect(CandidateRowSchema.safeParse({ ...row, ...corruption }).success).toBe(false);
  });
});

describe('ranked candidate rows', () => {
  const ranked = {
    id: row.id,
    alias: 'C04',
    display_name: 'Sofia Martínez',
    guard_status: 'clean',
    shortlisted_at: null,
  };

  it('carry the latest score when the candidate has a scorecard', () => {
    const mapped = toRankedCandidate(
      RankedCandidateRowSchema.parse({
        ...ranked,
        score: 72,
        must_haves_met: 3,
        must_haves_total: 4,
      }),
    );

    expect(mapped.latestScore).toEqual({ score: 72, mustHavesMet: 3, mustHavesTotal: 4 });
  });

  it('have no score when the left join found no scorecard', () => {
    const mapped = toRankedCandidate(
      RankedCandidateRowSchema.parse({
        ...ranked,
        score: null,
        must_haves_met: null,
        must_haves_total: null,
      }),
    );

    expect(mapped.latestScore).toBeNull();
  });
});
