import { describe, expect, it } from 'vitest';

import type { Requirement } from '../jobs/job';
import { computeScore, type RatedRequirement, RATING_VALUES } from './compute-score';
import type { Rating } from './scorecard';

/** The SPEC §12 rubric: four weighted must-haves and three nice-to-haves (Σ weight = 13). */
const RUBRIC: Requirement[] = [
  { id: 'R1', text: 'TypeScript and React', kind: 'must', weight: 3 },
  { id: 'R2', text: 'APIs and PostgreSQL', kind: 'must', weight: 3 },
  { id: 'R3', text: 'LLM features', kind: 'must', weight: 2 },
  { id: 'R4', text: 'RAG', kind: 'must', weight: 2 },
  { id: 'R5', text: 'AWS serverless', kind: 'nice', weight: 1 },
  { id: 'R6', text: 'CI/CD', kind: 'nice', weight: 1 },
  { id: 'R7', text: 'Mentoring', kind: 'nice', weight: 1 },
];

function rated(...ratings: Rating[]): RatedRequirement[] {
  return ratings.map((rating, index) => ({ requirementId: `R${String(index + 1)}`, rating }));
}

describe('computeScore', () => {
  it.each<[Rating, number]>([
    ['strong', 1],
    ['partial', 0.5],
    ['none', 0],
    ['unclear', 0],
  ])('values a %s rating at %d', (rating, value) => {
    expect(RATING_VALUES[rating]).toBe(value);
  });

  it.each<[string, RatedRequirement[], number, number]>([
    ['every requirement strong', rated(...Array<Rating>(7).fill('strong')), 100, 4],
    ['every requirement none', rated(...Array<Rating>(7).fill('none')), 0, 0],
    ['every requirement unclear', rated(...Array<Rating>(7).fill('unclear')), 0, 0],
    [
      'strong must-haves only',
      rated('strong', 'strong', 'strong', 'strong', 'none', 'none', 'none'),
      77, // 10 / 13 = 76.9
      4,
    ],
    [
      'partial must-haves and strong nice-to-haves',
      rated('partial', 'partial', 'partial', 'partial', 'strong', 'strong', 'strong'),
      62, // (5 + 3) / 13 = 61.5
      4,
    ],
    [
      'a thin resume: partial on two must-haves, unclear elsewhere',
      rated('partial', 'unclear', 'partial', 'unclear', 'unclear', 'unclear', 'unclear'),
      19, // 2.5 / 13 = 19.2
      2,
    ],
  ])('scores %s against the SPEC 12 rubric', (_label, assessments, score, mustHavesMet) => {
    expect(computeScore(RUBRIC, assessments)).toEqual({ score, mustHavesMet, mustHavesTotal: 4 });
  });

  it('rounds an exact half up', () => {
    const requirements: Requirement[] = [
      { id: 'R1', text: 'a', kind: 'nice', weight: 1 },
      { id: 'R2', text: 'b', kind: 'nice', weight: 7 },
    ];

    // 100 × 1 / 8 = 12.5
    expect(computeScore(requirements, rated('strong', 'none')).score).toBe(13);
  });

  it('scores an empty rubric as 0 instead of dividing by zero', () => {
    expect(computeScore([], [])).toEqual({ score: 0, mustHavesMet: 0, mustHavesTotal: 0 });
  });

  it('counts a requirement the assessments leave out as unclear', () => {
    const assessments = rated('strong', 'strong', 'strong').filter((a) => a.requirementId !== 'R2');

    expect(computeScore(RUBRIC, assessments)).toEqual({
      score: 38, // R1 and R3 strong: (3 + 2) / 13 = 38.5%, rounded down
      mustHavesMet: 2,
      mustHavesTotal: 4,
    });
  });

  it('ignores an assessment for a requirement the job does not have', () => {
    const assessments = [...rated('none'), { requirementId: 'R9', rating: 'strong' as const }];

    expect(computeScore(RUBRIC, assessments)).toEqual({
      score: 0,
      mustHavesMet: 0,
      mustHavesTotal: 4,
    });
  });

  it('counts a must-have rated partial as met, but not one rated unclear or none', () => {
    const requirements: Requirement[] = [
      { id: 'R1', text: 'a', kind: 'must', weight: 1 },
      { id: 'R2', text: 'b', kind: 'must', weight: 1 },
      { id: 'R3', text: 'c', kind: 'must', weight: 1 },
      { id: 'R4', text: 'd', kind: 'nice', weight: 1 },
    ];

    expect(computeScore(requirements, rated('partial', 'unclear', 'none', 'strong'))).toEqual({
      score: 38, // 1.5 / 4 = 37.5, rounded half up
      mustHavesMet: 1,
      mustHavesTotal: 3,
    });
  });
});
