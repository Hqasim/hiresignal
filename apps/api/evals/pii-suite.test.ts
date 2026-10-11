import { describe, expect, it } from 'vitest';

import { leakedNameWords, type PiiSnippetRun, summarizePii } from './pii-suite';

describe('leakedNameWords', () => {
  it.each([
    { name: 'Mei Lin Chen', text: 'Built a data pipeline in Lincoln.', leaked: 0 },
    { name: 'Mei Lin Chen', text: '[PERSON_1] led the team; Chen reviewed it.', leaked: 1 },
    { name: 'Mei Lin Chen', text: 'mei lin chen', leaked: 3 },
    { name: "Liam O'Connor", text: "Reviewed by O'Connor", leaked: 1 },
    { name: 'Sofia Martínez', text: 'Martínezville', leaked: 0 },
    { name: null, text: 'Anything at all', leaked: 0 },
  ])('finds $leaked whole words of $name', ({ name, text, leaked }) => {
    expect(leakedNameWords(text, name)).toBe(leaked);
  });
});

describe('summarizePii', () => {
  const snippets: PiiSnippetRun[] = [
    {
      id: 'P01',
      entities: [
        { type: 'EMAIL', leaked: false },
        { type: 'PHONE', leaked: false },
      ],
    },
    {
      id: 'P02',
      entities: [
        { type: 'EMAIL', leaked: true },
        { type: 'URL', leaked: false },
      ],
    },
  ];

  it('computes recall per type over the labelled entities and lists the leaking snippets', () => {
    const summary = summarizePii(snippets, []);

    expect(summary.snippets).toBe(2);
    expect(summary.entities).toBe(4);
    expect(summary.entityLeaks).toBe(1);
    expect(summary.leakedSnippets).toEqual(['P02']);
    expect(summary.byType).toEqual([
      { type: 'EMAIL', labelled: 2, redacted: 1, recall: 0.5 },
      { type: 'PHONE', labelled: 1, redacted: 1, recall: 1 },
      { type: 'URL', labelled: 1, redacted: 1, recall: 1 },
    ]);
  });

  it('adds name words left in the redacted resumes to the leak total', () => {
    const summary = summarizePii(snippets, [
      { alias: 'C01', nameWords: 2, leakedNameWords: 0 },
      { alias: 'C04', nameWords: 2, leakedNameWords: 1 },
    ]);

    expect(summary.resumes).toBe(2);
    expect(summary.nameLeaks).toBe(1);
    expect(summary.leakedResumes).toEqual(['C04']);
    expect(summary.leaks).toBe(2);
  });

  it('lists types in the order of the PII type union, skipping unlabelled ones', () => {
    const summary = summarizePii(
      [
        {
          id: 'P01',
          entities: [
            { type: 'GRAD_YEAR', leaked: false },
            { type: 'PERSON', leaked: false },
          ],
        },
      ],
      [],
    );

    expect(summary.byType.map((row) => row.type)).toEqual(['PERSON', 'GRAD_YEAR']);
  });
});
