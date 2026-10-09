import { beforeEach, describe, expect, it } from 'vitest';

import { aScreeningWorld, type ScreeningWorld } from '../../../test/helpers/screening-world';
import { createScreeningTools, type RunScreeningTool } from './screening-tools';

const RETRIEVAL = { searchTopK: 2, poolPerArm: 20, rrfK: 60, maxQueryChars: 40 };

let world: ScreeningWorld;
let run: RunScreeningTool;

beforeEach(async () => {
  world = await aScreeningWorld();
  run = createScreeningTools(
    { embedder: world.embedder, chunks: world.chunks, retrieval: RETRIEVAL },
    {
      jobId: world.job.id,
      candidateId: world.c04,
      requirementIds: ['R1', 'R5'],
      sections: ['experience', 'skills', 'projects'],
    },
  );
});

describe('search_resume', () => {
  it("embeds the query and searches only the screened candidate's chunks", async () => {
    const outcome = await run({
      name: 'search_resume',
      args: { query: 'React dashboards', requirementId: 'R1' },
    });

    expect(world.embedder.queries).toEqual(['React dashboards']);
    expect(world.chunks.searches).toEqual([
      expect.objectContaining({
        jobId: world.job.id,
        candidateId: world.c04,
        queryText: 'React dashboards',
        poolPerArm: 20,
        rrfK: 60,
        limit: 2,
      }),
    ]);
    expect(outcome.chunks).toHaveLength(2);
    expect(outcome.chunks.every((chunk) => chunk.alias === 'C04')).toBe(true);
  });

  it('returns the chunks spotlighted with their refs, and no scores', async () => {
    const outcome = await run({
      name: 'search_resume',
      args: { query: 'React dashboards', requirementId: 'R1' },
    });

    const { result } = outcome.response;
    expect(typeof result).toBe('string');
    for (const chunk of outcome.chunks) {
      expect(result).toContain(`[${chunk.ref}]\n<untrusted_resume_chunk>`);
      expect(chunk).not.toHaveProperty('similarity');
    }
  });

  it('traces the parsed arguments', async () => {
    const outcome = await run({
      name: 'search_resume',
      args: { query: '  React  ', requirementId: 'R1' },
    });

    expect(outcome.tool).toBe('search_resume');
    expect(outcome.args).toEqual({ query: 'React', requirementId: 'R1' });
  });

  it.each([
    ['an unknown requirement', { query: 'React', requirementId: 'R9' }, 'requirementId'],
    ['a query over the limit', { query: 'x'.repeat(41), requirementId: 'R1' }, 'query'],
    ['a missing query', { requirementId: 'R1' }, 'query'],
  ])(
    'answers %s with an error the model can act on, without searching',
    async (_l, args, field) => {
      const outcome = await run({ name: 'search_resume', args });

      expect(outcome.response).toEqual({ error: expect.stringContaining(field) as unknown });
      expect(outcome.chunks).toEqual([]);
      expect(world.embedder.queries).toEqual([]);
    },
  );

  it('caps a malformed argument in the trace instead of storing it whole', async () => {
    const outcome = await run({
      name: 'search_resume',
      args: { query: 'x'.repeat(500), requirementId: 7 },
    });

    expect(outcome.args.query).toHaveLength(40);
    expect(outcome.args.requirementId).toBe('7');
  });
});

describe('read_section', () => {
  it('returns every chunk of the section, matching its name case-insensitively', async () => {
    const outcome = await run({ name: 'read_section', args: { section: 'Projects' } });

    expect(outcome.chunks.map((chunk) => chunk.ref)).toEqual(['C04#2']);
    expect(outcome.args).toEqual({ section: 'projects' });
  });

  it('lists the real sections when asked for one the resume does not have', async () => {
    const outcome = await run({ name: 'read_section', args: { section: 'publications' } });

    expect(outcome.response).toEqual({
      error: 'No section "publications". Use one of: experience, skills, projects.',
    });
  });

  it('rejects a blank section name', async () => {
    const outcome = await run({ name: 'read_section', args: { section: ' ' } });

    expect(outcome.response).toHaveProperty('error');
  });
});

describe('an unknown tool', () => {
  it('is answered with an error and left out of the trace', async () => {
    const outcome = await run({ name: 'update_score', args: { score: 10 } });

    expect(outcome).toEqual({
      response: { error: 'Unknown tool. Use search_resume or read_section.' },
      tool: null,
      args: { score: '10' },
      chunks: [],
    });
  });
});
