import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  AGENT_SEARCH_TOP_K,
  CACHE_MIN_PREFIX_TOKENS,
  CACHE_PREFIX_MARGIN,
  MAX_AGENT_STEPS,
} from '../../config/ai';
import { estimateTokens } from '../../domain/chunking/token-estimate';
import { JobSlugSchema } from '../../domain/jobs/job';
import { readDataset } from '../../infrastructure/dataset/fs-dataset';
import { buildScreeningPrefix, type ScreeningJob } from './screening-prefix';

const DATA_DIRECTORY = fileURLToPath(new URL('../../../../../data/', import.meta.url));
const LIMITS = { maxAgentSteps: MAX_AGENT_STEPS, searchTopK: AGENT_SEARCH_TOP_K };

/** The demo job from `data/jobs/` (SPEC §12), the one every candidate is screened against. */
let job: ScreeningJob;

beforeAll(async () => {
  ({ job } = await readDataset(DATA_DIRECTORY, JobSlugSchema.parse('senior-fullstack-ai')));
});

describe('buildScreeningPrefix', () => {
  it('is byte-identical every time it is built for the same job', () => {
    expect(buildScreeningPrefix(job, LIMITS)).toBe(buildScreeningPrefix({ ...job }, LIMITS));
  });

  it('is long enough for Gemini implicit caching, with a margin for the token estimate', () => {
    const minimum = Math.ceil(CACHE_MIN_PREFIX_TOKENS * (1 + CACHE_PREFIX_MARGIN));

    expect(estimateTokens(buildScreeningPrefix(job, LIMITS))).toBeGreaterThanOrEqual(minimum);
  });

  it('holds no candidate alias, uuid, timestamp or date, so it never varies by candidate or time', () => {
    const prefix = buildScreeningPrefix(job, LIMITS);

    expect(prefix).not.toMatch(/\bC\d{2}\b/);
    expect(prefix).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(prefix).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('lists every requirement with its kind and weight', () => {
    const prefix = buildScreeningPrefix(job, LIMITS);

    for (const requirement of job.requirements) {
      const kind = requirement.kind === 'must' ? 'must-have' : 'nice-to-have';
      expect(prefix).toContain(
        `- ${requirement.id} (${kind}, weight ${String(requirement.weight)}): ${requirement.text}`,
      );
    }
  });

  it('states the agent limits it was given', () => {
    const prefix = buildScreeningPrefix(job, { maxAgentSteps: 5, searchTopK: 3 });

    expect(prefix).toContain('at most 5 turns');
    expect(prefix).toContain('up to 3 chunks');
  });

  it.each([
    ['the rubric', '# 3. Rubric'],
    ['the untrusted-content policy', '<untrusted_resume_chunk>'],
    ['the fairness rules', 'protected attribute'],
    ['the skills-list rule', 'A bare mention of a skill in a Skills list or a Summary'],
    ['the worked examples', 'fictional candidate, X01'],
    ['the output contracts', '# 8. Output contracts'],
  ])('includes %s', (_label, text) => {
    expect(buildScreeningPrefix(job, LIMITS)).toContain(text);
  });
});
