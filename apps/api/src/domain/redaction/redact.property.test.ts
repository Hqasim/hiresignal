import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { redact } from './redact';

/** Fixed seed, so a failure reproduces exactly and CI never flakes (testing rules: determinism). */
const RUN = { seed: 20261009, numRuns: 300 };
const noName = { personName: null };

const word = fc.stringMatching(/^[a-z]{1,10}$/);
const techWord = fc.constantFrom('TypeScript', 'React', 'Postgres', 'AWS', 'Lambda', 'Hono');
const separator = fc.constantFrom(' ', ', ', '. ', '; ', '\n', ' - ');
const digits = (length: number): fc.Arbitrary<string> =>
  fc.stringMatching(new RegExp(`^\\d{${String(length)}}$`));

/** Prose with no PII in it: lowercase words, technology names and punctuation. */
const piiFreeText = fc
  .array(fc.tuple(fc.oneof(word, techWord), separator), { maxLength: 40 })
  .map((pairs) => pairs.map(([token, sep]) => token + sep).join(''));

const email = fc.emailAddress();
const usPhone = fc
  .tuple(digits(3), digits(3), digits(4), fc.integer({ min: 0, max: 3 }))
  .map(([area, exchange, line, format]) => {
    const formats = [
      `(${area}) ${exchange}-${line}`,
      `${area}-${exchange}-${line}`,
      `${area}.${exchange}.${line}`,
      `+1 ${area} ${exchange} ${line}`,
    ];
    return formats[format] ?? formats[0];
  });

/** Resume-like text mixing prose with generated PII. */
const resumeText = fc
  .array(fc.oneof(word, techWord, email, usPhone, fc.constant('## Education'), separator), {
    maxLength: 30,
  })
  .map((parts) => parts.join(' '));

describe('redact (properties)', () => {
  it('never lets a generated email address through', () => {
    fc.assert(
      fc.property(piiFreeText, email, piiFreeText, (before, address, after) => {
        const { text } = redact(`${before} ${address} ${after}`, noName);

        expect(text).not.toContain(address);
      }),
      RUN,
    );
  });

  it('never lets a generated US phone number through', () => {
    fc.assert(
      fc.property(piiFreeText, usPhone, piiFreeText, (before, phone, after) => {
        const { text } = redact(`${before} ${phone} ${after}`, noName);

        expect(text).not.toContain(phone);
        expect(text).toContain('[PHONE_1]');
      }),
      RUN,
    );
  });

  it('is idempotent: redacting redacted text changes nothing', () => {
    fc.assert(
      fc.property(resumeText, (input) => {
        const once = redact(input, noName).text;

        expect(redact(once, noName)).toEqual({ text: once, summary: [] });
      }),
      RUN,
    );
  });

  it('leaves text without PII unchanged', () => {
    fc.assert(
      fc.property(piiFreeText, (input) => {
        expect(redact(input, noName)).toEqual({ text: input, summary: [] });
      }),
      RUN,
    );
  });
});
