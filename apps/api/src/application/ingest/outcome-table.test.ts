import { describe, expect, it } from 'vitest';

import { CandidateAliasSchema, CandidateIdSchema } from '../../domain/candidates/candidate';
import type { IngestOutcome } from './ingest-resume';
import { formatOutcomeTable } from './outcome-table';

function outcome(overrides: Partial<IngestOutcome>): IngestOutcome {
  return {
    alias: CandidateAliasSchema.parse('C01'),
    candidateId: CandidateIdSchema.parse('00000000-0000-4000-8000-000000000001'),
    created: true,
    guardStatus: 'clean',
    signalIds: [],
    dismissedIds: [],
    classifier: { verdict: 'benign', confidence: 0.934, rationale: 'Ordinary.' },
    chunkCount: 6,
    ...overrides,
  };
}

describe('formatOutcomeTable', () => {
  it('renders one aligned row per outcome under a header', () => {
    const table = formatOutcomeTable([
      outcome({}),
      outcome({
        alias: CandidateAliasSchema.parse('C06'),
        guardStatus: 'quarantined',
        signalIds: ['L1.html-comment', 'L2.instruction-override', 'L2.instruction-override'],
        classifier: null,
        chunkCount: 0,
      }),
      outcome({
        alias: CandidateAliasSchema.parse('C10'),
        created: false,
        dismissedIds: ['L0.zero-width'],
        chunkCount: null,
      }),
    ]);

    expect(table.split('\n')).toEqual([
      'Alias  Status       Stored   Signals                                   Dismissed      Classifier   Chunks',
      'C01    clean        created  –                                         –              benign 0.93  6',
      'C06    quarantined  created  L1.html-comment, L2.instruction-override  –              –            0',
      'C10    clean        skipped  –                                         L0.zero-width  benign 0.93  –',
    ]);
  });

  it('renders only the header when nothing was seeded', () => {
    expect(formatOutcomeTable([])).toBe(
      'Alias  Status  Stored  Signals  Dismissed  Classifier  Chunks',
    );
  });
});
