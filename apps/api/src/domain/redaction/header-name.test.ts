import { describe, expect, it } from 'vitest';

import { extractHeaderName } from './header-name';

describe('extractHeaderName', () => {
  it.each([
    ['the first-level heading', '# Priya Raman\nSenior engineer', 'Priya Raman'],
    ['a heading after blank lines', '\n\n#   Mei Lin Chen  \n## Summary', 'Mei Lin Chen'],
    ['the first of several headings', '# Liam O’Connor\n# Other', 'Liam O’Connor'],
  ])('reads %s', (_label, text, expected) => {
    expect(extractHeaderName(text)).toBe(expected);
  });

  it.each([
    ['text with no heading', 'Priya Raman\nSenior engineer'],
    ['only second-level headings', '## Summary\nBuilds things'],
    ['a heading with no text', '#   \n## Summary'],
  ])('returns null for %s', (_label, text) => {
    expect(extractHeaderName(text)).toBeNull();
  });
});
