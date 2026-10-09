import { describe, expect, it } from 'vitest';

import { findEducationSection } from './education-section';

describe('findEducationSection', () => {
  it('spans from the Education heading to the next top-level heading', () => {
    const text = '## Skills\nGo\n## Education\nB.S.\n### Minor\n## Projects\nX';
    const span = findEducationSection(text);

    expect(span).not.toBeNull();
    expect(text.slice(span?.start, span?.end)).toBe('## Education\nB.S.\n### Minor\n');
  });

  it('runs to the end of the text when Education is the last section', () => {
    const text = '## Summary\nHi\n## education\nB.S.';

    expect(findEducationSection(text)).toEqual({ start: 14, end: text.length });
  });

  it.each([
    ['no Education section', '## Summary\nHi'],
    ['Education only as a third-level heading', '### Education\nB.S.'],
    ['Education in prose', 'Continuing ## Education matters'],
  ])('returns null for %s', (_label, text) => {
    expect(findEducationSection(text)).toBeNull();
  });
});
