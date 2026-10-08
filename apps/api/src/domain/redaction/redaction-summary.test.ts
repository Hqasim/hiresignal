import { describe, expect, it } from 'vitest';

import { RedactionSummarySchema } from './redaction-summary';

describe('redaction summaries', () => {
  it('count redacted entities per PII type', () => {
    const summary = [
      { type: 'EMAIL', count: 2 },
      { type: 'GRAD_YEAR', count: 1 },
    ];

    expect(RedactionSummarySchema.parse(summary)).toEqual(summary);
  });

  it('accept an empty summary for a resume with nothing to redact', () => {
    expect(RedactionSummarySchema.parse([])).toEqual([]);
  });

  it.each([
    ['an unknown PII type', [{ type: 'SSN', count: 1 }]],
    ['a zero count', [{ type: 'EMAIL', count: 0 }]],
    [
      'the same type twice',
      [
        { type: 'EMAIL', count: 1 },
        { type: 'EMAIL', count: 2 },
      ],
    ],
  ])('reject %s', (_label, summary) => {
    expect(RedactionSummarySchema.safeParse(summary).success).toBe(false);
  });
});
