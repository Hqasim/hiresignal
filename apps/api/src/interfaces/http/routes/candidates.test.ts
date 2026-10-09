import { CandidateDetailSchema, ProblemSchema, ScreenResponseSchema } from '@hiresignal/contracts';
import { describe, expect, it } from 'vitest';

import { fakeLlmResponse } from '../../../../test/fakes/fake-llm-client';
import { callsTurn } from '../../../../test/helpers/screening-world';
import { aTestApp, storeScorecard } from '../../../../test/helpers/test-app';
import type { LlmCallRecord } from '../../../application/ports/llm-call-repository';

const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000ff';

describe('GET /api/candidates/:id', () => {
  it('returns the redacted resume, guard verdict and latest scorecard joined to the rubric', async () => {
    const { app, world } = await aTestApp();
    await storeScorecard(world.scorecards, world.c04, 75);

    const response = await app.request(`/api/candidates/${world.c04}`);

    expect(response.status).toBe(200);
    const detail = CandidateDetailSchema.parse(await response.json());
    expect(detail).toMatchObject({
      alias: 'C04',
      displayName: null,
      score: 75,
      guard: { status: 'clean', signals: [], dismissed: [], classifier: null },
      redactionSummary: [{ type: 'EMAIL', count: 1 }],
    });
    expect(detail.scorecard?.requirements[0]).toMatchObject({
      requirementId: 'R1',
      text: 'TypeScript and React',
      kind: 'must',
      weight: 3,
      rating: 'strong',
    });
    expect(detail.scorecard?.createdAt).toBe('2026-10-09T12:00:00.000Z');
  });

  it('lets the UI highlight each citation: its span selects the quoted resume text', async () => {
    const { app, world } = await aTestApp();
    await storeScorecard(world.scorecards, world.c04, 75);

    const detail = CandidateDetailSchema.parse(
      await (await app.request(`/api/candidates/${world.c04}`)).json(),
    );

    const citation = detail.scorecard?.requirements[0]?.citations[0];
    expect(detail.redactedResume.slice(citation?.span.start, citation?.span.end)).toBe(
      citation?.quote,
    );
  });

  it('shows a quarantined candidate with its injection span and no scorecard', async () => {
    const { app, world } = await aTestApp();

    const detail = CandidateDetailSchema.parse(
      await (await app.request(`/api/candidates/${world.c06}`)).json(),
    );

    expect(detail.guard.status).toBe('quarantined');
    expect(detail.guard.signals[0]).toMatchObject({
      severity: 'high',
      span: { start: 0, end: 33 },
    });
    expect(detail.scorecard).toBeNull();
    expect(detail.score).toBeNull();
  });

  it('answers an unknown id with a 404 problem', async () => {
    const { app } = await aTestApp();

    const response = await app.request(`/api/candidates/${UNKNOWN_ID}`);

    expect(response.status).toBe(404);
  });

  it('answers a malformed id with a 400 problem that names the parameter', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/candidates/not-a-uuid');

    expect(response.status).toBe(400);
    expect(ProblemSchema.parse(await response.json())).toMatchObject({
      code: 'VALIDATION_FAILED',
      detail: 'Invalid path parameter: id.',
    });
  });
});

describe('POST /api/candidates/:id/shortlist', () => {
  it('shortlists the candidate and reveals the name', async () => {
    const { app, world } = await aTestApp();

    const response = await app.request(`/api/candidates/${world.c04}/shortlist`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(CandidateDetailSchema.parse(await response.json())).toMatchObject({
      shortlisted: true,
      displayName: 'Person C04',
    });
    const listed = await app.request('/api/jobs/senior-fullstack-ai/candidates');
    expect(JSON.stringify(await listed.json())).toContain('Person C04');
  });

  it('is idempotent: shortlisting twice keeps the first time', async () => {
    const { app, world, clock } = await aTestApp();
    await app.request(`/api/candidates/${world.c04}/shortlist`, { method: 'POST' });
    clock.advance(60_000);

    const again = await app.request(`/api/candidates/${world.c04}/shortlist`, { method: 'POST' });

    expect(again.status).toBe(200);
    const stored = world.candidates.candidates.find((c) => c.id === world.c04);
    expect(stored?.shortlistedAt).toEqual(new Date('2026-10-09T15:00:00Z'));
  });

  it('answers an unknown id with a 404 problem', async () => {
    const { app } = await aTestApp();

    const response = await app.request(`/api/candidates/${UNKNOWN_ID}/shortlist`, {
      method: 'POST',
    });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/candidates/:id/screen', () => {
  const DRAFT = {
    requirements: [
      {
        requirementId: 'R1',
        rating: 'strong',
        rationale: 'Dashboards in React and TypeScript.',
        citations: [{ ref: 'C04#0', quote: 'Built React and TypeScript dashboards' }],
      },
      { requirementId: 'R5', rating: 'none', rationale: 'Not found.', citations: [] },
    ],
    strengths: [],
    concerns: [],
    summary: 'Frontend evidence.',
  };
  const SCRIPT = [
    callsTurn([{ id: 'a', name: 'read_section', args: { section: 'experience' } }]),
    fakeLlmResponse('DONE'),
    fakeLlmResponse(JSON.stringify(DRAFT), { model: 'flash-model' }),
  ];

  it('re-runs screening live and returns the new scorecard', async () => {
    const { app, world, llm } = await aTestApp({ script: SCRIPT });

    const response = await app.request(`/api/candidates/${world.c04}/screen`, {
      method: 'POST',
      headers: { 'x-request-id': 'req-screen' },
    });

    expect(response.status).toBe(200);
    const { scorecard } = ScreenResponseSchema.parse(await response.json());
    expect(scorecard).toMatchObject({ score: 75, mustHaves: { met: 1, total: 1 } });
    expect(llm.requests.every((request) => request.requestId === 'req-screen')).toBe(true);
    expect(world.scorecards.scorecards).toHaveLength(1);
  });

  it('refuses a quarantined candidate with a 409 problem, without calling a model', async () => {
    const { app, world, llm } = await aTestApp();

    const response = await app.request(`/api/candidates/${world.c06}/screen`, { method: 'POST' });

    expect(response.status).toBe(409);
    expect(ProblemSchema.parse(await response.json()).code).toBe('CANDIDATE_QUARANTINED');
    expect(llm.requests).toEqual([]);
  });

  it("answers 429 with Retry-After once today's live calls reach the cap", async () => {
    const { app, world, llm, calls } = await aTestApp({ cap: 1 });
    calls.rows.push({
      source: 'live',
      createdAt: new Date('2026-10-09T08:00:00Z'),
    } as LlmCallRecord);

    const response = await app.request(`/api/candidates/${world.c04}/screen`, { method: 'POST' });

    expect(response.status).toBe(429);
    // 15:00 UTC → 9 hours until midnight
    expect(response.headers.get('retry-after')).toBe('32400');
    expect(ProblemSchema.parse(await response.json())).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      retryAfter: 32400,
    });
    expect(llm.requests).toEqual([]);
  });

  it('answers an unknown id with a 404 problem', async () => {
    const { app } = await aTestApp();

    const response = await app.request(`/api/candidates/${UNKNOWN_ID}/screen`, {
      method: 'POST',
    });

    expect(response.status).toBe(404);
  });
});
