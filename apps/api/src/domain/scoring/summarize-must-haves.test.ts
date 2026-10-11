import { describe, expect, it } from 'vitest';

import type { Requirement } from '../jobs/job';
import type { Rating } from './scorecard';
import { type RatedRequirement, summarizeMustHaves } from './summarize-must-haves';

/** The SPEC §12 rubric: four must-haves and three nice-to-haves. */
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

describe('summarizeMustHaves', () => {
  it.each<[string, RatedRequirement[], { met: number; strong: number }]>([
    ['every requirement strong', rated(...Array<Rating>(7).fill('strong')), { met: 4, strong: 4 }],
    [
      'every requirement partial (skills-list claims, like C03)',
      rated(...Array<Rating>(7).fill('partial')),
      { met: 4, strong: 0 },
    ],
    [
      'a mix of every rating on the must-haves',
      rated('strong', 'partial', 'none', 'unclear', 'strong', 'strong', 'strong'),
      { met: 2, strong: 1 },
    ],
    [
      'strong nice-to-haves only',
      rated('none', 'none', 'none', 'none', 'strong', 'strong', 'strong'),
      { met: 0, strong: 0 },
    ],
  ])('counts must-haves met and strong for %s', (_label, ratings, expected) => {
    expect(summarizeMustHaves(RUBRIC, ratings)).toEqual({ ...expected, total: 4 });
  });

  it('counts a must-have the ratings leave out as unclear', () => {
    const ratings = rated('strong', 'strong').filter((r) => r.requirementId !== 'R2');

    expect(summarizeMustHaves(RUBRIC, ratings)).toEqual({ met: 1, strong: 1, total: 4 });
  });

  it('ignores a rating for a requirement the job does not have', () => {
    const ratings = [{ requirementId: 'R9', rating: 'strong' as const }];

    expect(summarizeMustHaves(RUBRIC, ratings)).toEqual({ met: 0, strong: 0, total: 4 });
  });

  it('reports zero of zero for a rubric without must-haves', () => {
    const rubric = RUBRIC.filter((requirement) => requirement.kind === 'nice');

    expect(summarizeMustHaves(rubric, rated('strong'))).toEqual({ met: 0, strong: 0, total: 0 });
  });
});
