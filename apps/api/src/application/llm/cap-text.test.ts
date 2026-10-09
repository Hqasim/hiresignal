import { describe, expect, it } from 'vitest';

import { capText } from './cap-text';

describe('capText', () => {
  it.each([
    ['short text', 'Built RAG.', 20, 'Built RAG.'],
    ['text exactly at the limit', 'abcde', 5, 'abcde'],
    ['surrounding whitespace', '  Built RAG.\n', 20, 'Built RAG.'],
    ['text over the limit', 'abcdefgh', 5, 'abcd…'],
  ])('returns %s within the limit', (_label, text, max, expected) => {
    expect(capText(text, max)).toBe(expected);
  });
});
