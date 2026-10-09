import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CHUNK_MAX_TOKENS } from '../../config/ai';
import { QUESTION_MAX_CHARS } from '../../domain/ask/ask-limits';
import { formatChunkRef, parseChunkRef } from '../../domain/candidates/chunk-ref';
import { chunkResume } from '../../domain/chunking/chunk-resume';
import { scanQuestion } from '../../domain/guard/scan-question';
import { prepareResume } from '../../domain/ingestion/prepare-resume';
import { JobSlugSchema } from '../../domain/jobs/job';
import { readDataset } from './fs-dataset';
import { readRetrievalSet } from './retrieval-set';

// SPEC §12: the golden questions for ask, written after the resumes. Checked offline against the
// real resumes, so a renamed alias or a re-chunked resume can't silently invalidate them.

const DATA_DIRECTORY = fileURLToPath(new URL('../../../../../data/', import.meta.url));
const questions = await readRetrievalSet(DATA_DIRECTORY);
const { resumes } = await readDataset(DATA_DIRECTORY, JobSlugSchema.parse('senior-fullstack-ai'));

/** The two resumes the guard quarantines (SPEC §12): never chunked, so never retrievable. */
const QUARANTINED = new Set(['C06', 'C07']);

const refsByAlias = new Map(
  resumes.map((resume) => {
    const { redaction } = prepareResume(resume.text);
    const chunks = chunkResume(redaction.text, {
      alias: resume.alias,
      maxTokens: CHUNK_MAX_TOKENS,
    });
    return [
      resume.alias,
      new Set(chunks.map((chunk) => formatChunkRef(resume.alias, chunk.ordinal))),
    ];
  }),
);

describe('data/evals/retrieval.jsonl', () => {
  it('has 20 answerable questions and at least three out-of-scope ones, with unique ids', () => {
    const answerable = questions.filter((q) => q.expected.length > 0);
    const outOfScope = questions.filter((q) => q.expected.length === 0);

    expect(answerable.map((q) => q.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`),
    );
    expect(outOfScope.length).toBeGreaterThanOrEqual(3);
    expect(outOfScope.every((q) => q.id.startsWith('X') && q.refs.length === 0)).toBe(true);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it.each(questions.map((q) => [q.id, q] as const))(
    '%s passes the question guard and fits the length limit',
    (_id, { question }) => {
      expect(scanQuestion(question).rejected).toBe(false);
      expect(question.length).toBeLessThanOrEqual(QUESTION_MAX_CHARS);
    },
  );

  it.each(questions.map((q) => [q.id, q] as const))(
    '%s expects only candidates that exist and are retrievable',
    (_id, question) => {
      for (const alias of question.expected) {
        expect(refsByAlias.has(alias)).toBe(true);
        expect(QUARANTINED.has(alias)).toBe(false);
      }
    },
  );

  it.each(questions.map((q) => [q.id, q] as const))(
    '%s cites only real chunks of its expected candidates',
    (_id, question) => {
      for (const ref of question.refs) {
        const alias = parseChunkRef(ref)?.alias;
        expect(alias !== undefined && question.expected.includes(alias)).toBe(true);
        expect(alias !== undefined && refsByAlias.get(alias)?.has(ref)).toBe(true);
      }
    },
  );
});

describe('readRetrievalSet', () => {
  it('names the line that fails validation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrieval-set-'));
    try {
      await mkdir(join(directory, 'evals'));
      await writeFile(
        join(directory, 'evals', 'retrieval.jsonl'),
        '{"id":"Q01","question":"Who?","expected":["C01"],"refs":[]}\n{"id":"Q2","question":"","expected":[],"refs":[]}\nnot json\n',
      );

      await expect(readRetrievalSet(directory)).rejects.toThrow(
        /retrieval\.jsonl:2: invalid id, question/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a line that is not JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'retrieval-set-'));
    try {
      await mkdir(join(directory, 'evals'));
      await writeFile(join(directory, 'evals', 'retrieval.jsonl'), 'not json\n');

      await expect(readRetrievalSet(directory)).rejects.toThrow(
        /retrieval\.jsonl:1: invalid \(root\)/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
