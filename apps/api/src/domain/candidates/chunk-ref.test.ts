import { describe, expect, it } from 'vitest';

import { CandidateAliasSchema } from './candidate';
import { ChunkRefSchema, formatChunkRef, parseChunkRef } from './chunk-ref';

describe('chunk refs', () => {
  it.each([
    ['C04', 3, 'C04#3'],
    ['C10', 0, 'C10#0'],
    ['C01', 42, 'C01#42'],
  ])('format %s and ordinal %i as %s, and parse it back', (alias, ordinal, ref) => {
    const formatted = formatChunkRef(CandidateAliasSchema.parse(alias), ordinal);

    expect(formatted).toBe(ref);
    expect(parseChunkRef(formatted)).toEqual({ alias, ordinal });
  });

  it.each([
    ['an empty string', ''],
    ['a missing ordinal', 'C04#'],
    ['a missing separator', 'C043'],
    ['a lowercase alias', 'c04#3'],
    ['a one-digit alias', 'C4#3'],
    ['a negative ordinal', 'C04#-1'],
    ['a fractional ordinal', 'C04#1.5'],
    ['surrounding text', 'see C04#3'],
    ['a trailing newline', 'C04#3\n'],
  ])('reject %s instead of guessing', (_label, text) => {
    expect(parseChunkRef(text)).toBeNull();
    expect(ChunkRefSchema.safeParse(text).success).toBe(false);
  });

  it('refuse to format an ordinal that is not a non-negative integer', () => {
    const alias = CandidateAliasSchema.parse('C04');

    expect(() => formatChunkRef(alias, -1)).toThrow(RangeError);
    expect(() => formatChunkRef(alias, 1.5)).toThrow(RangeError);
  });
});
