import { describe, expect, it } from 'vitest';

import { locateQuote, normalizeWhitespace } from './locate-quote';

describe('normalizeWhitespace', () => {
  it.each([
    ['plain text', 'Led a team', 'Led a team'],
    ['a line break and indent', 'Led a\n  team', 'Led a team'],
    ['tabs and double spaces', 'Led\t\ta  team', 'Led a team'],
    ['surrounding whitespace', '\n  Led a team  \n', 'Led a team'],
    ['only whitespace', ' \n\t ', ''],
  ])('collapses %s', (_label, text, expected) => {
    expect(normalizeWhitespace(text)).toBe(expected);
  });
});

describe('locateQuote', () => {
  const content = '- Built a RAG\n  pipeline on pgvector.\n- Led  a team of four.';

  it('finds an exact quote and returns its span in the original text', () => {
    const span = locateQuote(content, 'pipeline on pgvector');

    expect(span).toEqual({ start: 16, end: 36 });
    expect(content.slice(span?.start, span?.end)).toBe('pipeline on pgvector');
  });

  it('matches a quote that crosses a line break, and returns the text as the resume shows it', () => {
    const span = locateQuote(content, 'Built a RAG pipeline on pgvector.');

    expect(content.slice(span?.start, span?.end)).toBe('Built a RAG\n  pipeline on pgvector.');
  });

  it('matches a single space in the quote against a double space in the resume', () => {
    const span = locateQuote(content, 'Led a team of four');

    expect(content.slice(span?.start, span?.end)).toBe('Led  a team of four');
  });

  it('ignores whitespace around the quote', () => {
    expect(locateQuote(content, '  Led a team\n')).not.toBeNull();
  });

  it.each([
    ['a paraphrase', 'Built a retrieval pipeline'],
    ['a different case', 'built a rag pipeline'],
    ['changed punctuation', 'Led a team of four!'],
    ['an empty quote', ''],
    ['a blank quote', '  \n '],
    ['text from another chunk', 'Shipped tool calling to production'],
  ])('returns null for %s', (_label, quote) => {
    expect(locateQuote(content, quote)).toBeNull();
  });

  it('returns the first occurrence when the quote appears twice', () => {
    expect(locateQuote('React app. React app.', 'React app')).toEqual({ start: 0, end: 9 });
  });

  it('keeps redaction tokens exact', () => {
    const redacted = 'Mentored [PERSON_2] and two interns.';

    expect(locateQuote(redacted, 'Mentored [PERSON_2] and')).toEqual({ start: 0, end: 23 });
    expect(locateQuote(redacted, 'Mentored Jane and')).toBeNull();
  });
});
