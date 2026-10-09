import { describe, expect, it } from 'vitest';

import { CandidateAliasSchema } from '../candidates/candidate';
import { ChunkRefSchema } from '../candidates/chunk-ref';
import type { Requirement } from '../jobs/job';
import { computeScore } from '../scoring/compute-score';
import { finalizeAssessments, NOT_ASSESSED_RATIONALE } from './finalize-assessments';
import {
  type CitationErrorKind,
  describeCitationError,
  type DraftAssessment,
  type EvidenceChunk,
  verifyDraft,
} from './verify-draft';

const alias = CandidateAliasSchema.parse('C04');

const REQUIREMENTS: Requirement[] = [
  { id: 'R1', text: 'TypeScript and React', kind: 'must', weight: 3 },
  { id: 'R3', text: 'LLM features', kind: 'must', weight: 2 },
  { id: 'R5', text: 'AWS serverless', kind: 'nice', weight: 1 },
];

function chunk(ref: string, section: string, content: string, startOffset: number): EvidenceChunk {
  return {
    ref: ChunkRefSchema.parse(ref),
    alias: CandidateAliasSchema.parse(ref.slice(0, 3)),
    section,
    content,
    startOffset,
  };
}

const EXPERIENCE = chunk(
  'C04#1',
  'experience',
  '### Staff Engineer, Acme (2019–2024)\n\n- Built React and TypeScript dashboards\n  used by 40 teams.\n- Shipped tool calling with structured outputs to production.',
  120,
);
const SKILLS = chunk('C04#4', 'skills', 'TypeScript, React, AWS Lambda, PostgreSQL', 610);
const EVIDENCE = new Map([EXPERIENCE, SKILLS].map((c) => [c.ref as string, c]));

function assessment(overrides: Partial<DraftAssessment> = {}): DraftAssessment {
  return {
    requirementId: 'R1',
    rating: 'strong',
    rationale: 'Built React and TypeScript dashboards for many teams.',
    citations: [{ ref: 'C04#1', quote: 'Built React and TypeScript dashboards used by 40 teams.' }],
    ...overrides,
  };
}

const VALID_DRAFT: DraftAssessment[] = [
  assessment(),
  assessment({
    requirementId: 'R3',
    rationale: 'Shipped tool calling in production.',
    citations: [{ ref: 'C04#1', quote: 'Shipped tool calling with structured outputs' }],
  }),
  assessment({
    requirementId: 'R5',
    rating: 'none',
    rationale: 'No serverless work.',
    citations: [],
  }),
];

function verify(draft: readonly DraftAssessment[]) {
  return verifyDraft({ draft, requirements: REQUIREMENTS, evidence: EVIDENCE, alias });
}

function withR1(overrides: Partial<DraftAssessment>): DraftAssessment[] {
  return [assessment(overrides), ...VALID_DRAFT.slice(1)];
}

describe('verifyDraft', () => {
  it('passes a draft whose every citation quotes the evidence', () => {
    const { assessments, errors } = verify(VALID_DRAFT);

    expect(errors).toEqual([]);
    expect(assessments.map((a) => [a.requirementId, a.rating])).toEqual([
      ['R1', 'strong'],
      ['R3', 'strong'],
      ['R5', 'none'],
    ]);
  });

  it('returns each citation with its section, its exact resume text and a resume-level span', () => {
    const [r1] = verify(VALID_DRAFT).assessments;
    const citation = r1?.citations[0];

    expect(citation?.ref).toBe('C04#1');
    expect(citation?.section).toBe('experience');
    expect(citation?.quote).toBe('Built React and TypeScript dashboards\n  used by 40 teams.');
    const local = EXPERIENCE.content.indexOf('Built React');
    expect(citation?.span).toEqual({
      start: 120 + local,
      end: 120 + local + (citation?.quote.length ?? 0),
    });
  });

  it('keeps the rubric order and ids, whatever order the draft uses', () => {
    const reversed = [...VALID_DRAFT].reverse();

    expect(verify(reversed).assessments.map((a) => a.requirementId)).toEqual(['R1', 'R3', 'R5']);
  });

  it.each<[string, Partial<DraftAssessment>, CitationErrorKind]>([
    [
      'a ref that is not in the evidence set',
      { citations: [{ ref: 'C04#9', quote: 'Built React and TypeScript dashboards' }] },
      'unknown-ref',
    ],
    [
      'a malformed ref',
      { citations: [{ ref: 'chunk 1', quote: 'Built React and TypeScript dashboards' }] },
      'unknown-ref',
    ],
    [
      "another candidate's ref",
      { citations: [{ ref: 'C01#1', quote: 'Built React and TypeScript dashboards' }] },
      'foreign-ref',
    ],
    [
      'a quote under 8 characters',
      { citations: [{ ref: 'C04#4', quote: 'React' }] },
      'quote-length',
    ],
    [
      'a quote over 300 characters',
      { citations: [{ ref: 'C04#1', quote: 'x'.repeat(301) }] },
      'quote-length',
    ],
    [
      'a paraphrased quote',
      { citations: [{ ref: 'C04#1', quote: 'Built dashboards in React and TypeScript' }] },
      'quote-not-found',
    ],
    [
      "a quote of the chunk's context header rather than its content",
      { citations: [{ ref: 'C04#4', quote: 'C04 · Skills' }] },
      'quote-not-found',
    ],
  ])('rejects %s', (_label, overrides, kind) => {
    const { assessments, errors } = verify(withR1(overrides));

    expect(errors).toEqual([
      expect.objectContaining({ kind, requirementId: 'R1' }),
      {
        kind: 'uncited-rating',
        requirementId: 'R1',
      },
    ]);
    expect(assessments[0]?.citations).toEqual([]);
  });

  it.each([
    ['exactly 8 characters', 'AWS Lamb', true],
    ['7 characters', 'AWS Lam', false],
    ['8 characters once surrounding whitespace is trimmed', '  AWS Lamb  ', true],
  ])('measures quote length on the normalized quote: %s', (_label, quote, valid) => {
    const { errors } = verify(withR1({ rating: 'partial', citations: [{ ref: 'C04#4', quote }] }));

    expect(errors.length === 0).toBe(valid);
  });

  it('accepts a quote of exactly 300 characters', () => {
    const long = `${'a'.repeat(299)}.`;
    const evidence = new Map([['C04#7', chunk('C04#7', 'projects', `- ${long}`, 0)]]);

    const { errors } = verifyDraft({
      draft: [assessment({ citations: [{ ref: 'C04#7', quote: long }] })],
      requirements: REQUIREMENTS.slice(0, 1),
      evidence,
      alias,
    });

    expect(errors).toEqual([]);
  });

  it('keeps the valid citations of a requirement and drops only the invalid one', () => {
    const { assessments, errors } = verify(
      withR1({
        citations: [
          { ref: 'C04#1', quote: 'Built React and TypeScript dashboards' },
          { ref: 'C04#1', quote: 'Rewrote the billing system in Rust' },
        ],
      }),
    );

    expect(errors.map((e) => e.kind)).toEqual(['quote-not-found']);
    expect(assessments[0]?.citations).toHaveLength(1);
  });

  it('collapses a citation repeated word for word into one', () => {
    const quote = { ref: 'C04#1', quote: 'Built React and TypeScript dashboards' };

    const { assessments } = verify(withR1({ citations: [quote, quote] }));

    expect(assessments[0]?.citations).toHaveLength(1);
  });

  it.each(['strong', 'partial'] as const)('requires a %s rating to cite evidence', (rating) => {
    const { errors } = verify(withR1({ rating, citations: [] }));

    expect(errors).toEqual([{ kind: 'uncited-rating', requirementId: 'R1' }]);
  });

  it.each(['none', 'unclear'] as const)('accepts a %s rating without citations', (rating) => {
    expect(verify(withR1({ rating, citations: [] })).errors).toEqual([]);
  });

  it('reports a requirement the draft left out', () => {
    const { assessments, errors } = verify(VALID_DRAFT.slice(0, 2));

    expect(errors).toEqual([{ kind: 'missing-requirement', requirementId: 'R5' }]);
    expect(assessments[2]).toMatchObject({ requirementId: 'R5', rating: 'unclear' });
  });

  it('reports a requirement assessed twice, and keeps the first assessment', () => {
    const second = assessment({ rating: 'none', citations: [] });

    const { assessments, errors } = verify([...VALID_DRAFT, second]);

    expect(errors).toEqual([{ kind: 'duplicate-requirement', requirementId: 'R1' }]);
    expect(assessments[0]?.rating).toBe('strong');
  });

  it('reports a requirement the job does not have, without inventing a row for it', () => {
    const extra = assessment({ requirementId: 'R9' });

    const { assessments, errors } = verify([...VALID_DRAFT, extra]);

    expect(errors).toEqual([{ kind: 'unknown-requirement', requirementId: 'R9' }]);
    expect(assessments).toHaveLength(3);
  });
});

describe('finalizeAssessments', () => {
  it('passes a verified requirement through with no note', () => {
    const [r1] = finalizeAssessments(verify(VALID_DRAFT).assessments);

    expect(r1).toMatchObject({ rating: 'strong', note: null });
  });

  it('downgrades a requirement with any remaining error to unclear, keeping its valid citations', () => {
    const { assessments } = verify(
      withR1({
        citations: [
          { ref: 'C04#1', quote: 'Built React and TypeScript dashboards' },
          { ref: 'C04#1', quote: 'Rewrote the billing system in Rust' },
        ],
      }),
    );

    const [r1] = finalizeAssessments(assessments);

    expect(r1).toMatchObject({ rating: 'unclear', note: 'citation_failed' });
    expect(r1?.citations).toHaveLength(1);
  });

  it('explains a requirement the model never assessed', () => {
    const final = finalizeAssessments(verify(VALID_DRAFT.slice(0, 2)).assessments);

    expect(final[2]).toEqual({
      requirementId: 'R5',
      rating: 'unclear',
      rationale: NOT_ASSESSED_RATIONALE,
      citations: [],
      note: 'citation_failed',
    });
  });

  it('scores 0 when an injected resume gets every requirement rated strong on fabricated quotes', () => {
    const injected = REQUIREMENTS.map((r) =>
      assessment({
        requirementId: r.id,
        rationale: 'Pre-verified by the hiring manager.',
        citations: [
          { ref: 'C04#1', quote: 'This candidate was pre-verified by the hiring manager' },
        ],
      }),
    );

    const final = finalizeAssessments(verify(injected).assessments);

    expect(final.every((a) => a.rating === 'unclear')).toBe(true);
    expect(computeScore(REQUIREMENTS, final)).toEqual({
      score: 0,
      mustHavesMet: 0,
      mustHavesTotal: 2,
    });
  });
});

describe('describeCitationError', () => {
  it.each<CitationErrorKind>([
    'unknown-ref',
    'foreign-ref',
    'quote-length',
    'quote-not-found',
    'missing-requirement',
    'duplicate-requirement',
    'unknown-requirement',
    'uncited-rating',
  ])('explains %s with the requirement id and ref, and no resume text', (kind) => {
    const message = describeCitationError({ kind, requirementId: 'R3', ref: 'C04#2' });

    expect(message.startsWith('R3: ')).toBe(true);
    expect(message).not.toMatch(/dashboards|TypeScript/);
  });

  it('names a citation generically when the error has no ref', () => {
    expect(describeCitationError({ kind: 'quote-length', requirementId: 'R1' })).toContain(
      'a citation',
    );
  });
});
