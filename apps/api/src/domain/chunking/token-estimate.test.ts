import { describe, expect, it } from 'vitest';

import { estimateTokens } from './token-estimate';

describe('estimateTokens', () => {
  it.each([
    ['', 0],
    ['a', 1],
    ['abcd', 1],
    ['abcde', 2],
    ['Twelve chars', 3],
  ])('estimates %j as %i tokens', (text, tokens) => {
    expect(estimateTokens(text)).toBe(tokens);
  });
});
