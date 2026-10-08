import { describe, expect, it } from 'vitest';

import { JobSlugSchema, RequirementsSchema } from './job';

const R1 = { id: 'R1', text: '5+ years of TypeScript and React', kind: 'must', weight: 3 };
const R5 = { id: 'R5', text: 'AWS serverless experience', kind: 'nice', weight: 1 };

describe('job requirements', () => {
  it('accept must-have and nice-to-have requirements with positive weights', () => {
    expect(RequirementsSchema.parse([R1, R5])).toEqual([R1, R5]);
  });

  it.each([
    ['no requirements at all', []],
    ['a duplicate id', [R1, { ...R5, id: 'R1' }]],
    ['an id that is not R<number>', [{ ...R1, id: 'req-1' }]],
    ['an unknown kind', [{ ...R1, kind: 'bonus' }]],
    ['a zero weight', [{ ...R1, weight: 0 }]],
    ['a fractional weight', [{ ...R1, weight: 1.5 }]],
    ['empty text', [{ ...R1, text: '' }]],
  ])('reject %s', (_label, requirements) => {
    expect(RequirementsSchema.safeParse(requirements).success).toBe(false);
  });
});

describe('job slugs', () => {
  it.each(['senior-fullstack-ai', 'job1'])('accept the URL-safe slug %s', (slug) => {
    expect(JobSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(['', 'Senior', 'two  words', '-leading', 'trailing-', 'a/b'])('reject %j', (slug) => {
    expect(JobSlugSchema.safeParse(slug).success).toBe(false);
  });
});
