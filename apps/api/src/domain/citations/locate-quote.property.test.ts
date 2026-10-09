import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { locateQuote, normalizeWhitespace } from './locate-quote';

/** A fixed seed keeps CI deterministic; change it locally to explore. */
const SEED = 20261009;

const word = fc.stringMatching(/^[A-Za-z0-9[\]_.,–-]{1,8}$/);
const gap = fc.constantFrom(' ', '  ', '\n', '\n  ', '\t', ' \n\n ');

/** Text built from words and varied whitespace, so line breaks and double spaces are common. */
const text = fc
  .array(fc.tuple(word, gap), { minLength: 1, maxLength: 30 })
  .map((parts) => parts.map(([w, g]) => w + g).join(''));

describe('locateQuote (property)', () => {
  it('finds any run of whole words, re-spaced, and its span reproduces them', () => {
    fc.assert(
      fc.property(text, fc.nat(), fc.nat(), (content, a, b) => {
        const words = normalizeWhitespace(content).split(' ');
        const from = a % words.length;
        const to = from + 1 + (b % (words.length - from));
        const quote = words.slice(from, to).join(' \n ');

        const span = locateQuote(content, quote);

        expect(span).not.toBeNull();
        const slice = content.slice(span?.start, span?.end);
        expect(normalizeWhitespace(slice)).toBe(normalizeWhitespace(quote));
        expect(slice).toBe(slice.trim());
      }),
      { seed: SEED },
    );
  });

  it('never returns a span for a quote that is not in the text', () => {
    fc.assert(
      fc.property(text, (content) => {
        expect(locateQuote(content, `${normalizeWhitespace(content)} §missing`)).toBeNull();
      }),
      { seed: SEED },
    );
  });
});
