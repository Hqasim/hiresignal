import { describe, expect, it } from 'vitest';

import { CandidateAliasSchema } from '../../domain/candidates/candidate';
import { ChunkRefSchema } from '../../domain/candidates/chunk-ref';
import { rehydrateRedactedText } from '../../domain/redaction/redacted-text';
import { toJsonSchema } from '../llm/json-schema';
import {
  buildRepairTurn,
  buildSynthesisTurn,
  normalizeDraft,
  type ScorecardDraft,
  ScorecardDraftSchema,
} from './screening-synthesis';

const alias = CandidateAliasSchema.parse('C04');

const draft: ScorecardDraft = {
  requirements: [
    {
      requirementId: 'R1',
      rating: 'strong',
      rationale: `  ${'x'.repeat(320)}  `,
      citations: [{ ref: 'C04#1', quote: '  Built React apps  ' }],
    },
  ],
  strengths: [' Ships React. ', '  '],
  concerns: [],
  summary: 'y'.repeat(450),
};

describe('ScorecardDraftSchema', () => {
  it('converts to a flat JSON Schema with only documented keywords', () => {
    const json = JSON.stringify(toJsonSchema(ScorecardDraftSchema));

    expect(json).toContain('"maxItems":3');
    expect(json).not.toContain('maxLength');
    expect(json).not.toContain('$ref');
  });

  it('rejects a fourth citation, so the model is asked to repair it', () => {
    const citation = { ref: 'C04#1', quote: 'Built React apps' };
    const requirement = { ...draft.requirements[0], citations: Array(4).fill(citation) };

    expect(ScorecardDraftSchema.safeParse({ ...draft, requirements: [requirement] }).success).toBe(
      false,
    );
  });
});

describe('normalizeDraft', () => {
  it('trims and caps rationales and the summary, and drops blank points', () => {
    const normalized = normalizeDraft(draft);

    expect(normalized.assessments[0]?.rationale).toHaveLength(300);
    expect(normalized.assessments[0]?.rationale.endsWith('…')).toBe(true);
    expect(normalized.summary).toHaveLength(400);
    expect(normalized.strengths).toEqual(['Ships React.']);
  });

  it('leaves quotes exactly as written, for verification to judge', () => {
    expect(normalizeDraft(draft).assessments[0]?.citations[0]?.quote).toBe('  Built React apps  ');
  });
});

describe('buildSynthesisTurn', () => {
  it('names the candidate, spotlights the evidence and lists the requirement ids', () => {
    const turn = buildSynthesisTurn(
      alias,
      [
        {
          ref: ChunkRefSchema.parse('C04#1'),
          contextHeader: rehydrateRedactedText('C04 · Experience'),
          content: rehydrateRedactedText('- Built React apps.'),
        },
      ],
      ['R1', 'R2'],
    );

    const text = turn.role === 'user' ? turn.text : '';
    expect(text.startsWith('Stage 2: write the scorecard for candidate C04.')).toBe(true);
    expect(text).toContain('[C04#1]\n<untrusted_resume_chunk>\nC04 · Experience');
    expect(text).toContain('Assess each of R1, R2 exactly once');
  });

  it('says plainly when the agent retrieved nothing', () => {
    const turn = buildSynthesisTurn(alias, [], ['R1']);

    expect(turn.role === 'user' && turn.text).toContain('No chunks found.');
  });
});

describe('buildRepairTurn', () => {
  it('lists every problem on its own line', () => {
    const turn = buildRepairTurn(['R1: first problem.', 'R3: second problem.']);

    expect(turn.role === 'user' && turn.text).toContain(
      '- R1: first problem.\n- R3: second problem.',
    );
  });
});
