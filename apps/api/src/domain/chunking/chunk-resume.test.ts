import { describe, expect, it } from 'vitest';

import { CandidateAliasSchema } from '../candidates/candidate';
import type { ResumeChunk } from '../chunks/resume-chunk';
import { rehydrateRedactedText } from '../redaction/redacted-text';
import { chunkResume, toEmbeddingInput } from './chunk-resume';

const alias = CandidateAliasSchema.parse('C04');

/** Test resumes are written as redacted text, which is what ingestion chunks. */
function chunk(text: string, maxTokens = 350): ResumeChunk[] {
  return chunkResume(rehydrateRedactedText(text), { alias, maxTokens });
}

const RESUME = [
  '# [PERSON_1]',
  '[EMAIL_1] | [PHONE_1]',
  '',
  '## Summary',
  '',
  'Senior engineer who ships.',
  '',
  '## Experience',
  '',
  '### Engineer, Acme (2021–2024)',
  '',
  '- Built the billing API.',
  '- Ran Postgres in production.',
  '',
  '### Developer, Beta (2018–2021)',
  '',
  '- Built React screens.',
  '',
  '## Skills',
  '',
  'TypeScript, React',
  '',
].join('\n');

describe('chunkResume', () => {
  it('makes one chunk per plain section and one per role, in resume order', () => {
    const chunks = chunk(RESUME);

    expect(
      chunks.map(({ ordinal, section, contextHeader, content }) => ({
        ordinal,
        section,
        contextHeader,
        content,
      })),
    ).toEqual([
      {
        ordinal: 0,
        section: 'summary',
        contextHeader: 'C04 · Summary',
        content: 'Senior engineer who ships.',
      },
      {
        ordinal: 1,
        section: 'experience',
        contextHeader: 'C04 · Experience · Engineer, Acme (2021–2024)',
        content:
          '### Engineer, Acme (2021–2024)\n\n- Built the billing API.\n- Ran Postgres in production.',
      },
      {
        ordinal: 2,
        section: 'experience',
        contextHeader: 'C04 · Experience · Developer, Beta (2018–2021)',
        content: '### Developer, Beta (2018–2021)\n\n- Built React screens.',
      },
      {
        ordinal: 3,
        section: 'skills',
        contextHeader: 'C04 · Skills',
        content: 'TypeScript, React',
      },
    ]);
  });

  it('records offsets so every chunk is the exact slice of the resume it came from', () => {
    for (const { content, startOffset, endOffset } of chunk(RESUME)) {
      expect(RESUME.slice(startOffset, endOffset)).toBe(content);
    }
  });

  it('leaves the name and contact preamble before the first section out', () => {
    const contents = chunk(RESUME).map((c) => c.content);

    expect(contents.join('\n')).not.toContain('[EMAIL_1]');
  });

  it('keeps text before the first role as its own chunk of the section', () => {
    const chunks = chunk(
      '## Experience\n\nEight years of backend work.\n\n### Engineer, Acme\n\n- Built APIs.',
    );

    expect(chunks.map((c) => [c.contextHeader, c.content])).toEqual([
      ['C04 · Experience', 'Eight years of backend work.'],
      ['C04 · Experience · Engineer, Acme', '### Engineer, Acme\n\n- Built APIs.'],
    ]);
  });

  it('splits an oversized role between bullets and keeps the role in every part’s header', () => {
    const bullets = [
      '- First bullet, forty characters long.',
      '- Second bullet, forty chars long too.',
      '- Third bullet, also forty characters.',
    ];
    const text = `## Experience\n\n### Engineer, Acme\n\n${bullets.join('\n')}`;

    const chunks = chunk(text, 12);

    expect(chunks.map((c) => [c.contextHeader, c.content])).toEqual([
      ['C04 · Experience · Engineer, Acme', `### Engineer, Acme\n\n${bullets[0] ?? ''}`],
      ['C04 · Experience · Engineer, Acme', bullets[1]],
      ['C04 · Experience · Engineer, Acme', bullets[2]],
    ]);
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2]);
  });

  it('packs as many whole bullets as fit under the limit into one chunk', () => {
    const text = '## Projects\n\n- One.\n- Two.\n- Three.\n- Four.';

    const chunks = chunk(text, 5);

    expect(chunks.map((c) => c.content)).toEqual(['- One.\n- Two.', '- Three.\n- Four.']);
  });

  it('keeps a single bullet whole even when it alone is over the limit', () => {
    const long = `- ${'Shipped a very long list of things '.repeat(10)}`.trimEnd();

    const chunks = chunk(`## Projects\n\n${long}\n- Short one.`, 10);

    expect(chunks.map((c) => c.content)).toEqual([long, '- Short one.']);
  });

  it('keeps an indented continuation line with its bullet', () => {
    const chunks = chunk(
      '## Projects\n\n- Built a search tool\n  over manuals.\n- Wrote evals.',
      6,
    );

    expect(chunks.map((c) => c.content)).toEqual([
      '- Built a search tool\n  over manuals.',
      '- Wrote evals.',
    ]);
  });

  it('splits plain paragraphs at blank lines', () => {
    const chunks = chunk('## Summary\n\nFirst paragraph here.\n\nSecond paragraph here.', 6);

    expect(chunks.map((c) => c.content)).toEqual([
      'First paragraph here.',
      'Second paragraph here.',
    ]);
  });

  it('skips a section with no body', () => {
    expect(chunk('## Summary\n\n## Skills\n\nGo').map((c) => c.section)).toEqual(['skills']);
  });

  it('treats #### headings as content, not as new roles', () => {
    const chunks = chunk('## Experience\n\n### Engineer, Acme\n\n#### Highlights\n- Built APIs.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe('### Engineer, Acme\n\n#### Highlights\n- Built APIs.');
  });

  it('names sections in lowercase and trims heading whitespace', () => {
    const chunks = chunk('## Open Source   \n\n- A library.');

    expect(chunks.map((c) => [c.section, c.contextHeader])).toEqual([
      ['open source', 'C04 · Open Source'],
    ]);
  });

  it('returns no chunks for a resume without sections', () => {
    expect(chunk('# [PERSON_1]\nJust a line.')).toEqual([]);
  });

  it('estimates each chunk’s tokens from its content', () => {
    const [summary] = chunk('## Summary\n\nTwelve chars');

    expect(summary?.tokenEstimate).toBe(3);
  });
});

describe('toEmbeddingInput', () => {
  it('puts the context header on the line before the content', () => {
    const [summary] = chunk('## Summary\n\nBuilds APIs.');

    expect(summary === undefined ? null : toEmbeddingInput(summary)).toBe(
      'C04 · Summary\nBuilds APIs.',
    );
  });
});
