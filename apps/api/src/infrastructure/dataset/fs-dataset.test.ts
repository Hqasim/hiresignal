import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { JobSlugSchema } from '../../domain/jobs/job';
import { aliasFromFileName, decodeCodePointEscapes, parseJobFile, readDataset } from './fs-dataset';

const DATA_DIRECTORY = fileURLToPath(new URL('../../../../../data/', import.meta.url));

const VALID_FRONT_MATTER = [
  '---',
  'slug: data-engineer',
  'title: Data Engineer',
  'company: Example Co',
  'requirements:',
  '  - { id: R1, text: SQL, kind: must, weight: 2 }',
  '---',
].join('\n');

describe('parseJobFile', () => {
  it('reads the front matter and uses the Markdown body as the description', () => {
    const job = parseJobFile(`${VALID_FRONT_MATTER}\n\nWe move data.\n`, 'job.md');

    expect(job).toEqual({
      slug: 'data-engineer',
      title: 'Data Engineer',
      company: 'Example Co',
      requirements: [{ id: 'R1', text: 'SQL', kind: 'must', weight: 2 }],
      description: 'We move data.',
    });
  });

  it.each([
    ['no front matter', 'We move data.', /expected YAML front matter/],
    [
      'an invalid requirement kind',
      `${VALID_FRONT_MATTER.replace('must', 'maybe')}\nWe move data.`,
      /requirements\.0\.kind/,
    ],
    [
      'an unknown field',
      `${VALID_FRONT_MATTER.replace('---\nslug', '---\nsalary: 1\nslug')}\nBody`,
      /salary/,
    ],
    ['an empty description', `${VALID_FRONT_MATTER}\n\n`, /description .* is empty/],
  ])('rejects a job file with %s, naming the file', (_case, text, problem) => {
    expect(() => parseJobFile(text, 'jobs/data-engineer.md')).toThrow(problem);
    expect(() => parseJobFile(text, 'jobs/data-engineer.md')).toThrow('jobs/data-engineer.md');
  });
});

describe('aliasFromFileName', () => {
  it.each([
    ['c01-priya-raman.md', 'C01'],
    ['c10-gabriel-silva.md', 'C10'],
  ])('gives %s the alias %s', (fileName, alias) => {
    expect(aliasFromFileName(fileName)).toBe(alias);
  });

  it.each(['C01-priya.md', 'c1-priya.md', 'c01_priya.md', 'c01-.md', 'priya.md'])(
    'rejects the misnamed file %s',
    (fileName) => {
      expect(() => aliasFromFileName(fileName)).toThrow('cNN-name.md');
    },
  );
});

describe('decodeCodePointEscapes', () => {
  it('turns each escape into the character it names', () => {
    expect(decodeCodePointEscapes(String.raw`Type\u{200B}Script \u{e0041}`)).toBe(
      'Type\u{200B}Script \u{E0041}',
    );
  });

  it('leaves text without escapes unchanged', () => {
    expect(decodeCodePointEscapes(String.raw`C:\users and \u200B`)).toBe(
      String.raw`C:\users and \u200B`,
    );
  });

  it('rejects an escape beyond the last code point', () => {
    expect(() => decodeCodePointEscapes(String.raw`\u{110000}`)).toThrow(RangeError);
  });
});

describe('readDataset', () => {
  it('reads the job and the ten resumes in alias order', async () => {
    const { job, resumes } = await readDataset(
      DATA_DIRECTORY,
      JobSlugSchema.parse('senior-fullstack-ai'),
    );

    expect(job.slug).toBe('senior-fullstack-ai');
    expect(job.requirements.map((requirement) => requirement.id)).toEqual([
      'R1',
      'R2',
      'R3',
      'R4',
      'R5',
      'R6',
      'R7',
    ]);
    expect(resumes.map((resume) => resume.alias)).toEqual(
      Array.from({ length: 10 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`),
    );
    expect(new Set(resumes.map((resume) => resume.sourceHash)).size).toBe(10);
    expect(resumes.every((resume) => /^[0-9a-f]{64}$/.test(resume.sourceHash))).toBe(true);
  });

  it('decodes the escaped zero-width spaces in C10', async () => {
    const { resumes } = await readDataset(
      DATA_DIRECTORY,
      JobSlugSchema.parse('senior-fullstack-ai'),
    );
    const c10 = resumes.find((resume) => resume.alias === 'C10');

    expect(c10?.text).toContain('Type\u{200B}Script');
    expect(c10?.text).not.toContain(String.raw`\u{`);
  });

  it('fails when the job file is missing', async () => {
    await expect(readDataset(DATA_DIRECTORY, JobSlugSchema.parse('no-such-job'))).rejects.toThrow(
      'no-such-job.md',
    );
  });
});
