import { describe, expect, it } from 'vitest';

import { CandidateAliasSchema } from '../candidates/candidate';
import { redact } from './redact';
import { joinRedactedText, rehydrateRedactedText, sliceRedactedText } from './redacted-text';

describe('derived redacted text', () => {
  const { text } = redact('# Ana Lee\nana@example.com\n## Skills\nGo', { personName: 'Ana Lee' });

  it('slices redacted text without changing it', () => {
    expect(sliceRedactedText(text, 2, 12)).toBe('[PERSON_1]');
  });

  it('joins redacted parts and aliases with a fixed separator', () => {
    const alias = CandidateAliasSchema.parse('C04');

    expect(joinRedactedText([alias, sliceRedactedText(text, 2, 12)], ' · ')).toBe(
      'C04 · [PERSON_1]',
    );
  });

  it('restores the brand on stored text without changing it', () => {
    expect(rehydrateRedactedText('[EMAIL_1]')).toBe('[EMAIL_1]');
  });
});
