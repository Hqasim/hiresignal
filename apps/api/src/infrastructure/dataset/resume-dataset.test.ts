import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CHUNK_MAX_TOKENS } from '../../config/ai';
import { chunkResume } from '../../domain/chunking/chunk-resume';
import { prepareResume } from '../../domain/ingestion/prepare-resume';
import { JobSlugSchema } from '../../domain/jobs/job';
import { findEducationSection } from '../../domain/redaction/education-section';
import { readDataset } from './fs-dataset';

// The rule-level half of SPEC §12's expected outcomes, checked offline over the real resumes.
// The classifier's half (C02 and C10 dismissed, C07 quarantined) needs recorded fixtures and is
// checked by the seed integration test.

const DATA_DIRECTORY = fileURLToPath(new URL('../../../../../data/', import.meta.url));
const { resumes } = await readDataset(DATA_DIRECTORY, JobSlugSchema.parse('senior-fullstack-ai'));
const prepared = resumes.map((resume) => ({ ...resume, ...prepareResume(resume.text) }));

/** Signal ids and severities each resume must raise from the rules alone (L0–L2). */
const EXPECTED_RULE_SIGNALS: Record<string, readonly string[]> = {
  C01: [],
  C02: ['L2.instruction-override:medium'],
  C03: [],
  C04: [],
  C05: [],
  C06: [
    'L1.html-comment:high',
    'L1.white-text:high',
    'L2.instruction-override:high',
    'L2.evaluator-targeting:high',
    'L2.output-forcing:high',
    'L2.instruction-override:high',
    'L2.evaluator-targeting:high',
    'L2.output-forcing:high',
  ],
  C07: ['L2.evaluator-targeting:medium', 'L2.output-forcing:medium'],
  C08: [],
  C09: [],
  C10: ['L0.zero-width:medium'],
};

const SECTIONS = ['Summary', 'Experience', 'Projects', 'Skills', 'Education'];

/** PII that must never survive redaction, in any resume. */
const PII_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['email', /@example\.(?:com|org)/i],
  ['phone', /555[ .-]?01\d\d/],
  ['profile URL', /linkedin\.com|github\.com\/|https?:\/\/|www\./i],
  ['street address', /Larkspur|97205/],
];

/** Matches `word` on its own, case-insensitively, so "Lin" doesn't match "pipeline". */
function wholeWord(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(String.raw`(?<!\p{L})${escaped}(?!\p{L})`, 'iu');
}

describe('data/resumes', () => {
  it.each(prepared.map((resume) => [resume.alias, resume] as const))(
    '%s raises exactly the rule signals SPEC §12 plans for it',
    (alias, resume) => {
      expect(resume.signals.map((signal) => `${signal.id}:${signal.severity}`)).toEqual(
        EXPECTED_RULE_SIGNALS[alias],
      );
    },
  );

  it.each(prepared.map((resume) => [resume.alias, resume] as const))(
    '%s starts with a # name, a contact line, and the five sections in order',
    (_alias, resume) => {
      const lines = resume.text.split('\n').filter((line) => line.trim() !== '');
      const headings = lines.filter((line) => line.startsWith('## ')).map((line) => line.slice(3));

      expect(lines[0]).toMatch(/^# \S/);
      expect(lines[1]).toContain('@example.');
      expect(headings).toEqual(SECTIONS);
    },
  );

  it.each(prepared.map((resume) => [resume.alias, resume] as const))(
    '%s leaks no contact details, links or name after redaction',
    (_alias, { headerName, redaction }) => {
      for (const [, pattern] of PII_PATTERNS) {
        expect(redaction.text).not.toMatch(pattern);
      }
      for (const part of (headerName ?? '').split(/\s+/)) {
        expect(redaction.text).not.toMatch(wholeWord(part));
      }
    },
  );

  it.each(prepared.map((resume) => [resume.alias, resume] as const))(
    '%s keeps no school name or year in its Education section',
    (_alias, { redaction }) => {
      const education = findEducationSection(redaction.text);
      const section = redaction.text.slice(education?.start ?? 0, education?.end ?? 0);

      expect(section).toContain('[SCHOOL_1]');
      expect(section).not.toMatch(/\b(?:19|20)\d{2}\b/);
      expect(section).not.toMatch(/University|College|Institute|School|Academy/);
    },
  );

  it('redacts all of C10’s planted PII: two emails, two phones, an address and three links', () => {
    const c10 = prepared.find((resume) => resume.alias === 'C10');

    expect(c10?.redaction.summary).toEqual([
      { type: 'PERSON', count: 1 },
      { type: 'EMAIL', count: 2 },
      { type: 'PHONE', count: 2 },
      { type: 'URL', count: 3 },
      { type: 'ADDRESS', count: 1 },
      { type: 'SCHOOL', count: 1 },
      { type: 'GRAD_YEAR', count: 2 },
    ]);
  });

  it.each(prepared.map((resume) => [resume.alias, resume] as const))(
    '%s chunks into exact slices that fit the token limit, one per role or section',
    (alias, { redaction }) => {
      const chunks = chunkResume(redaction.text, { alias, maxTokens: CHUNK_MAX_TOKENS });
      const roles = redaction.text.split('\n').filter((line) => line.startsWith('### '));

      expect(chunks.length).toBeGreaterThanOrEqual(roles.length + 3);
      for (const chunk of chunks) {
        expect(redaction.text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.content);
        expect(chunk.tokenEstimate).toBeLessThanOrEqual(CHUNK_MAX_TOKENS);
      }
    },
  );
});
