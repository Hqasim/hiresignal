import {
  CandidateListResponseSchema,
  JobDetailSchema,
  JobListResponseSchema,
  ProblemSchema,
} from '@hiresignal/contracts';
import { describe, expect, it } from 'vitest';

import { aTestApp, storeScorecard } from '../../../../test/helpers/test-app';

describe('GET /api/jobs', () => {
  it('lists jobs in the contract shape', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/jobs');

    expect(response.status).toBe(200);
    expect(JobListResponseSchema.parse(await response.json())).toEqual({
      jobs: [
        {
          slug: 'senior-fullstack-ai',
          title: 'Senior Full-Stack Engineer, AI Platform',
          company: 'Northbeam Analytics',
          requirementCount: 2,
        },
      ],
    });
  });

  it.each(['0', '101', 'ten'])('rejects ?limit=%s with a 400 problem', async (limit) => {
    const { app } = await aTestApp();

    const response = await app.request(`/api/jobs?limit=${limit}`);

    expect(response.status).toBe(400);
    expect(ProblemSchema.parse(await response.json())).toMatchObject({
      code: 'VALIDATION_FAILED',
      detail: 'Invalid query parameter: limit.',
    });
  });
});

describe('GET /api/jobs/:slug', () => {
  it('returns the job and its rubric, without internal ids', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/jobs/senior-fullstack-ai');

    const body = JobDetailSchema.parse(await response.json());
    expect(body.requirements).toEqual([
      { id: 'R1', text: 'TypeScript and React', kind: 'must', weight: 3 },
      { id: 'R5', text: 'AWS serverless', kind: 'nice', weight: 1 },
    ]);
    expect(body).not.toHaveProperty('id');
  });

  it('answers an unknown slug with a 404 problem', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/jobs/no-such-job');

    expect(response.status).toBe(404);
    expect(ProblemSchema.parse(await response.json()).code).toBe('NOT_FOUND');
  });

  it('answers a malformed slug with a 400 problem', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/jobs/Not_A_Slug');

    expect(response.status).toBe(400);
  });
});

describe('GET /api/jobs/:slug/candidates', () => {
  it('ranks scored candidates by score, then unscored ones, with quarantined last', async () => {
    const { app, world } = await aTestApp();
    await storeScorecard(world.scorecards, world.c01, 40);
    await storeScorecard(world.scorecards, world.c04, 75);

    const response = await app.request('/api/jobs/senior-fullstack-ai/candidates');

    const { candidates } = CandidateListResponseSchema.parse(await response.json());
    expect(candidates.map((c) => [c.alias, c.score, c.guardStatus])).toEqual([
      ['C04', 75, 'clean'],
      ['C01', 40, 'clean'],
      ['C06', null, 'quarantined'],
    ]);
    expect(candidates[0]?.mustHaves).toEqual({ met: 1, total: 1 });
  });

  it('hides every name until a person shortlists the candidate', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/jobs/senior-fullstack-ai/candidates');

    const { candidates } = CandidateListResponseSchema.parse(await response.json());
    expect(candidates.every((c) => c.displayName === null && !c.shortlisted)).toBe(true);
  });

  it('stops at ?limit=', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/jobs/senior-fullstack-ai/candidates?limit=1');

    expect(CandidateListResponseSchema.parse(await response.json()).candidates).toHaveLength(1);
  });

  it('answers an unknown job with a 404 problem', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/jobs/no-such-job/candidates');

    expect(response.status).toBe(404);
  });
});
