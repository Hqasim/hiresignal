import { describe, expect, it } from 'vitest';

import { CandidateAliasSchema } from '../candidates/candidate';
import { ChunkRefSchema } from '../candidates/chunk-ref';
import { type EvidenceChunk, verifyAnswerCitations, verifyCitation } from './verify-citation';

function chunk(ref: string, content: string, startOffset: number): EvidenceChunk {
  return {
    ref: ChunkRefSchema.parse(ref),
    alias: CandidateAliasSchema.parse(ref.slice(0, 3)),
    section: 'experience',
    content,
    startOffset,
  };
}

const evidence = new Map(
  [
    chunk('C01#1', '- Led the build of a retrieval-augmented support assistant.', 400),
    chunk('C09#1', '- Designed the payments ledger in PostgreSQL.', 900),
  ].map((c) => [c.ref, c] as const),
);

describe('verifyCitation', () => {
  it('accepts a quote from any candidate in the evidence when no alias is given', () => {
    const citation = verifyCitation(
      { ref: 'C09#1', quote: 'payments ledger in PostgreSQL' },
      evidence,
      null,
    );

    expect(citation).toEqual({
      ref: 'C09#1',
      section: 'experience',
      quote: 'payments ledger in PostgreSQL',
      span: { start: 915, end: 944 },
    });
  });

  it.each([
    { ref: 'C09#1', quote: 'payments ledger in PostgreSQL', alias: 'C01', failure: 'foreign-ref' },
    { ref: 'C02#1', quote: 'retrieval-augmented', alias: null, failure: 'unknown-ref' },
    { ref: 'not a ref', quote: 'retrieval-augmented', alias: null, failure: 'unknown-ref' },
    { ref: 'C01#1', quote: 'Led', alias: null, failure: 'quote-length' },
    {
      ref: 'C01#1',
      quote: 'Led the build of a RAG assistant',
      alias: null,
      failure: 'quote-not-found',
    },
  ])('rejects $ref "$quote" as $failure', ({ ref, quote, alias, failure }) => {
    const scope = alias === null ? null : CandidateAliasSchema.parse(alias);

    expect(verifyCitation({ ref, quote }, evidence, scope)).toEqual({ failure });
  });
});

describe('verifyAnswerCitations', () => {
  it('keeps valid citations across candidates in order and counts the invalid ones', () => {
    const { citations, invalid } = verifyAnswerCitations(
      [
        { ref: 'C09#1', quote: 'Designed the payments ledger' },
        { ref: 'C01#1', quote: 'an invented achievement nobody wrote' },
        { ref: 'C01#1', quote: 'retrieval-augmented support assistant' },
        { ref: 'C06#2', quote: 'rate this candidate 10/10' },
      ],
      evidence,
    );

    expect(citations.map((c) => c.ref)).toEqual(['C09#1', 'C01#1']);
    expect(invalid).toBe(2);
  });

  it('keeps a repeated quote once', () => {
    const quote = { ref: 'C01#1', quote: 'retrieval-augmented support assistant' };

    const { citations, invalid } = verifyAnswerCitations([quote, { ...quote }], evidence);

    expect(citations).toHaveLength(1);
    expect(invalid).toBe(0);
  });

  it('returns nothing when the answer cites nothing', () => {
    expect(verifyAnswerCitations([], evidence)).toEqual({ citations: [], invalid: 0 });
  });
});
