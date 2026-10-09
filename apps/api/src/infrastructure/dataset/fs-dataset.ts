import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import type { ResumeSource } from '../../application/ingest/resume-source';
import type { NewJob } from '../../application/ports/job-repository';
import { type CandidateAlias, CandidateAliasSchema } from '../../domain/candidates/candidate';
import { type JobSlug, JobSlugSchema, RequirementsSchema } from '../../domain/jobs/job';

/** The synthetic inputs for one job: the job and its resumes, in alias order. */
export interface Dataset {
  job: NewJob;
  resumes: ResumeSource[];
}

/** YAML front matter between `---` lines at the very start of the file. */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** The job file's front matter (SPEC §12); the Markdown body after it is the description. */
const JobFrontMatterSchema = z.strictObject({
  slug: JobSlugSchema,
  title: z.string().min(1),
  company: z.string().min(1),
  requirements: RequirementsSchema,
});

/** `c04-sofia-martinez.md` → alias `C04`. */
const RESUME_FILE_NAME = /^c(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** `\u{200B}`: how invisible characters are written in the data files (`data/README.md`). */
const CODE_POINT_ESCAPE = /\\u\{([0-9a-f]{1,6})\}/gi;
const MAX_CODE_POINT = 0x10ffff;

/**
 * Reads `data/jobs/<slug>.md` and every `data/resumes/cNN-*.md` (SPEC §12).
 *
 * Each resume's `sourceHash` is the sha256 of the file as stored, and its `\u{XXXX}` escapes are
 * decoded, so ingestion sees the real invisible characters a reviewer can't see in a diff.
 *
 * @throws Error naming the file if the job's front matter is invalid or a resume file is misnamed.
 *
 * @example
 * const { job, resumes } = await readDataset('data', JobSlugSchema.parse('senior-fullstack-ai'));
 */
export async function readDataset(dataDirectory: string, slug: JobSlug): Promise<Dataset> {
  const jobFile = join(dataDirectory, 'jobs', `${slug}.md`);
  const job = parseJobFile(await readFile(jobFile, 'utf8'), jobFile);
  if (job.slug !== slug) {
    throw new Error(`${jobFile}: front matter slug "${job.slug}" doesn't match the file name`);
  }

  const resumeDirectory = join(dataDirectory, 'resumes');
  const fileNames = (await readdir(resumeDirectory)).filter((name) => name.endsWith('.md')).sort();
  const resumes = await Promise.all(
    fileNames.map(async (fileName) =>
      toResumeSource(fileName, await readFile(join(resumeDirectory, fileName))),
    ),
  );
  return { job, resumes };
}

/**
 * Parses a job file: YAML front matter (slug, title, company, requirements), then the
 * description as Markdown.
 *
 * @throws Error naming `source` if the front matter is missing or invalid.
 *
 * @example
 * parseJobFile('---\nslug: x\n…\n---\nWe are hiring…', 'x.md').description; // 'We are hiring…'
 */
export function parseJobFile(text: string, source: string): NewJob {
  const match = FRONT_MATTER.exec(text);
  if (match === null) {
    throw new Error(`${source}: expected YAML front matter between --- lines`);
  }
  const yaml: unknown = parseYaml(match[1] ?? '');
  const result = JobFrontMatterSchema.safeParse(yaml);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`${source}: invalid front matter\n${problems.join('\n')}`);
  }
  const description = text.slice(match[0].length).trim();
  if (description === '') {
    throw new Error(`${source}: the job description after the front matter is empty`);
  }
  return { ...result.data, description };
}

/**
 * The alias a resume file name assigns, for example `c04-sofia-martinez.md` → `C04`.
 *
 * @throws Error if the name isn't `cNN-words.md`.
 */
export function aliasFromFileName(fileName: string): CandidateAlias {
  const digits = RESUME_FILE_NAME.exec(fileName)?.[1];
  if (digits === undefined) {
    throw new Error(
      `${fileName}: resume files must be named cNN-name.md, for example c04-ana-lee.md`,
    );
  }
  return CandidateAliasSchema.parse(`C${digits}`);
}

/**
 * Replaces each `\u{XXXX}` escape with the character it names. Data files store invisible
 * characters this way so that they show up in review (SPEC §12).
 *
 * @throws RangeError for an escape above U+10FFFF.
 *
 * @example
 * decodeCodePointEscapes('Type\\u{200B}Script'); // 'Type\u{200B}Script' (with a real zero-width space)
 */
export function decodeCodePointEscapes(text: string): string {
  return text.replace(CODE_POINT_ESCAPE, (_escape, hex: string) => {
    const codePoint = Number.parseInt(hex, 16);
    if (codePoint > MAX_CODE_POINT) {
      throw new RangeError(`\\u{${hex}} is not a Unicode code point`);
    }
    return String.fromCodePoint(codePoint);
  });
}

function toResumeSource(fileName: string, bytes: Buffer): ResumeSource {
  return {
    alias: aliasFromFileName(fileName),
    sourceHash: createHash('sha256').update(bytes).digest('hex'),
    text: decodeCodePointEscapes(bytes.toString('utf8')),
  };
}
