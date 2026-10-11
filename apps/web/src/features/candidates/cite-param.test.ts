import { describe, expect, it } from 'vitest';

import { citedCandidatePath, parseCiteParam } from './cite-param';

describe('cite param', () => {
  it('round-trips a span through the candidate link', () => {
    const path = citedCandidatePath('abc', { start: 120, end: 180 });

    expect(path).toBe('/candidates/abc?cite=120-180');
    expect(parseCiteParam(new URL(path, 'https://x').searchParams.get('cite'))).toEqual({
      start: 120,
      end: 180,
    });
  });

  it.each([
    null,
    '',
    '180-120',
    '5-5',
    '-1-4',
    '1.5-4',
    '1-4x',
    'a-b',
    '99999999999999999999-1e30',
  ])('ignores %j', (value) => {
    expect(parseCiteParam(value)).toBeNull();
  });
});
