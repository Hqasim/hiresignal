import { describe, expect, it } from 'vitest';

import { redact } from './redact';

const noName = { personName: null };

/** Wraps lines in an Education section, where schools and graduation years are redacted. */
function education(...lines: string[]): string {
  return ['## Education', ...lines].join('\n');
}

describe('redact', () => {
  describe('finds each kind of PII', () => {
    it.each([
      ['an email', 'Email: gabriel.silva@example.com', 'Email: [EMAIL_1]'],
      ['an email with a plus tag', 'jo+jobs@mail.example.com.', '[EMAIL_1].'],
      // Found by the fast-check property test: RFC 5322 allows these in the local part.
      ['an email with RFC 5322 symbols', 'Mail !#x{1}@a.aa now', 'Mail [EMAIL_1] now'],
      ['a US phone in parentheses', 'Call (415) 555-0142 today', 'Call [PHONE_1] today'],
      ['a dashed US phone', 'Tel 415-555-0142', 'Tel [PHONE_1]'],
      ['a dotted US phone', 'Tel 415.555.0142', 'Tel [PHONE_1]'],
      ['a US phone with a country code', 'Tel +1 415 555 0142', 'Tel [PHONE_1]'],
      ['a UK phone', 'Mobile: +44 20 7946 0958', 'Mobile: [PHONE_1]'],
      ['an Indian phone', 'Mobile: +91 98765 43210', 'Mobile: [PHONE_1]'],
      ['an https URL', 'See https://gabriel.dev/work.', 'See [URL_1].'],
      ['a www URL', 'Portfolio: www.gabriel.dev', 'Portfolio: [URL_1]'],
      ['a LinkedIn profile', 'linkedin.com/in/gabriel-silva', '[URL_1]'],
      ['a GitHub profile', 'Code at github.com/gsilva, mostly Go', 'Code at [URL_1], mostly Go'],
      ['a URL inside a Markdown link', '[GitHub](https://github.com/gsilva)', '[GitHub]([URL_1])'],
      ['a street line', 'Lives at 742 Evergreen Terrace.', 'Lives at [ADDRESS_1].'],
      ['a street line with a unit', '12 Harbor Ln, Apt 4B', '[ADDRESS_1]'],
      ['a city, state and ZIP', 'Springfield, IL 62704', '[ADDRESS_1]'],
      ['a ZIP+4', 'St. Louis, MO 63101-1234', '[ADDRESS_1]'],
      [
        'a full address as one entity',
        '742 Evergreen Terrace, Springfield, IL 62704',
        '[ADDRESS_1]',
      ],
    ])('redacts %s', (_label, input, expected) => {
      expect(redact(input, noName).text).toBe(expected);
    });

    it.each([
      ['a school ending in University', 'B.S. Computer Science, Lakeshore State University'],
      ['a University of … school', 'B.A., University of Westbrook'],
      ['an Institute of … school', 'M.S., Harborview Institute of Technology'],
      ['a College', 'A.S., Northfield Community College'],
      ['an Academy', 'Certificate, Brightpath Coding Academy'],
      ['a School', 'Diploma, Ridgeview High School'],
    ])('redacts %s in the Education section', (_label, line) => {
      const { text } = redact(education(line), noName);

      expect(text).toContain('[SCHOOL_1]');
      expect(text).not.toMatch(/Lakeshore|Westbrook|Harborview|Northfield|Brightpath|Ridgeview/);
    });

    it('redacts graduation years in the Education section, each year once', () => {
      const { text, summary } = redact(education('### Ridgeview University (2014–2018)'), noName);

      expect(text).toBe(education('### [SCHOOL_1] ([GRAD_YEAR_1]–[GRAD_YEAR_2])'));
      expect(summary).toEqual([
        { type: 'SCHOOL', count: 1 },
        { type: 'GRAD_YEAR', count: 2 },
      ]);
    });

    it('stops the Education section at the next top-level heading', () => {
      const input = [education('Ridgeview University, 2018'), '## Projects', 'Shipped in 2019'];

      expect(redact(input.join('\n'), noName).text).toBe(
        [education('[SCHOOL_1], [GRAD_YEAR_1]'), '## Projects', 'Shipped in 2019'].join('\n'),
      );
    });

    it('keeps the Education section open across ### role headings', () => {
      const input = education('### B.S.', 'Ridgeview University', '### M.S.', 'Graduated 2020');

      expect(redact(input, noName).text).toBe(
        education('### B.S.', '[SCHOOL_1]', '### M.S.', 'Graduated [GRAD_YEAR_1]'),
      );
    });
  });

  describe('redacts the header name', () => {
    it('replaces the full name and each part with one PERSON token', () => {
      const input =
        '# Priya Raman\nPriya led the team. Ms. Raman wrote the RFC. PRIYA RAMAN agreed.';

      expect(redact(input, { personName: 'Priya Raman' })).toEqual({
        text: '# [PERSON_1]\n[PERSON_1] led the team. Ms. [PERSON_1] wrote the RFC. [PERSON_1] agreed.',
        summary: [{ type: 'PERSON', count: 1 }],
      });
    });

    it('keeps the possessive suffix', () => {
      expect(redact("Priya's design", { personName: 'Priya Raman' }).text).toBe(
        "[PERSON_1]'s design",
      );
    });

    it.each([
      ['an accented name', 'Sofia Martínez', 'Martínez shipped it', '[PERSON_1] shipped it'],
      [
        'an apostrophe in the name',
        "Liam O'Connor",
        "O'Connor shipped it",
        '[PERSON_1] shipped it',
      ],
      [
        'a curly apostrophe in the text',
        "Liam O'Connor",
        'O’Connor shipped it',
        '[PERSON_1] shipped it',
      ],
      ['a three-part name', 'Mei Lin Chen', 'Lin and Chen', '[PERSON_1] and [PERSON_1]'],
    ])('handles %s', (_label, personName, input, expected) => {
      expect(redact(input, { personName }).text).toBe(expected);
    });

    it.each([
      ['inside a longer word', 'Daniel Kim', 'Kimball and Danielle', 'Kimball and Danielle'],
      ['a lone initial', 'J. Ellis', 'J. Ellis and J. Doe', '[PERSON_1] and J. Doe'],
      [
        'a generational suffix',
        'Gabriel Silva Jr.',
        'Jr. Developer Silva',
        'Jr. Developer [PERSON_1]',
      ],
      ['credentials after a comma', 'Priya Raman, PhD', 'PhD from Raman', 'PhD from [PERSON_1]'],
    ])('ignores %s', (_label, personName, input, expected) => {
      expect(redact(input, { personName }).text).toBe(expected);
    });

    it('redacts nothing for a header name with no usable part', () => {
      expect(redact('J. wrote it', { personName: 'J.' }).text).toBe('J. wrote it');
    });

    it('leaves names alone when there is no header name', () => {
      expect(redact('Priya led the team.', noName).text).toBe('Priya led the team.');
    });
  });

  describe('leaves job-relevant text alone', () => {
    it.each([
      ['a year range in Experience', '### Engineer, Acme (2018–2022)'],
      ['an ISO date', 'Launched 2021-03-15'],
      ['a version number', 'Upgraded to v1.2.3 and 10.4.1'],
      ['a thousands separator', 'Served 10,000 users and 1,250,000 requests'],
      ['an RGB colour', 'Theme color rgb(255,255,255) and rgb(255, 255, 255)'],
      ['framework names', 'Node.js, Next.js, ASP.NET and package.json'],
      ['GitHub as a product', 'GitHub Actions and LinkedIn Learning'],
      ['a bare github.com mention', 'Hosted on github.com.'],
      ['a five-digit metric', 'Handled 25000 requests per second'],
      ['a percentage and a duration', 'Cut p95 latency by 42% to 120 ms over 3-5 sprints'],
      ['a university outside Education', 'Partnered with Lakeshore State University on research'],
      ['a city and state without a ZIP', 'Remote · Austin, TX'],
      ['a number before capitalized words without a street suffix', 'Led 3 Senior Engineers'],
      ['a lone School keyword', education('Thesis on School Choice, GPA 3.8')],
      ['an already redacted resume', '# [PERSON_1]\n[EMAIL_1] · [PHONE_1]'],
    ])('keeps %s', (_label, input) => {
      expect(redact(input, noName)).toEqual({ text: input, summary: [] });
    });
  });

  describe('assigns tokens', () => {
    it('gives the same value the same token and numbers values per type', () => {
      const input = 'a@example.com, b@example.com, A@Example.com, (415) 555-0142';

      expect(redact(input, noName)).toEqual({
        text: '[EMAIL_1], [EMAIL_2], [EMAIL_1], [PHONE_1]',
        summary: [
          { type: 'EMAIL', count: 2 },
          { type: 'PHONE', count: 1 },
        ],
      });
    });

    it('treats formatting variants of one phone number as the same value', () => {
      expect(redact('+1 (415) 555-0142 or 415.555.0142', noName).text).toBe(
        '[PHONE_1] or [PHONE_1]',
      );
    });

    it('treats a URL with and without its scheme as the same value', () => {
      expect(redact('https://github.com/gsilva/ and github.com/gsilva', noName).text).toBe(
        '[URL_1] and [URL_1]',
      );
    });

    it('keeps an email whole even when it contains the header name', () => {
      const result = redact('priya.raman@example.com', { personName: 'Priya Raman' });

      expect(result).toEqual({ text: '[EMAIL_1]', summary: [{ type: 'EMAIL', count: 1 }] });
    });

    it('keeps a profile URL whole even when it contains the header name', () => {
      expect(redact('linkedin.com/in/priya-raman', { personName: 'Priya Raman' }).text).toBe(
        '[URL_1]',
      );
    });

    it('lists the summary in a fixed type order, whatever the order in the text', () => {
      const input = [
        '# Gabriel Silva',
        'github.com/gsilva · (415) 555-0142 · gabriel@example.com · 742 Evergreen Terrace',
        education('Ridgeview University, 2016'),
      ].join('\n');

      expect(redact(input, { personName: 'Gabriel Silva' }).summary.map((e) => e.type)).toEqual([
        'PERSON',
        'EMAIL',
        'PHONE',
        'URL',
        'ADDRESS',
        'SCHOOL',
        'GRAD_YEAR',
      ]);
    });
  });

  it('redacts a whole resume header and leaves the body intact', () => {
    const resume = [
      '# Gabriel Silva',
      'gabriel.silva@example.com · gsilva@example.org · (512) 555-0147 · +1 512 555 0199',
      '1200 Barton Springs Rd, Austin, TX 78704 · linkedin.com/in/gabrielsilva · github.com/gsilva',
      '',
      '## Summary',
      'Gabriel builds TypeScript and Postgres systems.',
      '',
      education('### B.S. Computer Science — Lakeshore State University (2011–2015)'),
    ].join('\n');

    expect(redact(resume, { personName: 'Gabriel Silva' }).text).toBe(
      [
        '# [PERSON_1]',
        '[EMAIL_1] · [EMAIL_2] · [PHONE_1] · [PHONE_2]',
        '[ADDRESS_1] · [URL_1] · [URL_2]',
        '',
        '## Summary',
        '[PERSON_1] builds TypeScript and Postgres systems.',
        '',
        education('### B.S. Computer Science — [SCHOOL_1] ([GRAD_YEAR_1]–[GRAD_YEAR_2])'),
      ].join('\n'),
    );
  });
});
