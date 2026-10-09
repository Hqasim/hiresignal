import { beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from '../../../test/fakes/fake-clock';
import { FakeLlmClient, fakeLlmResponse } from '../../../test/fakes/fake-llm-client';
import {
  aScreeningWorld,
  C04_CHUNKS,
  callsTurn,
  type ScreeningWorld,
} from '../../../test/helpers/screening-world';
import { CandidateIdSchema } from '../../domain/candidates/candidate';
import { CandidateQuarantinedError } from '../errors/candidate-quarantined-error';
import { LlmOutputInvalidError } from '../errors/llm-output-invalid-error';
import { NotFoundError } from '../errors/not-found-error';
import type { LlmResponse } from '../ports/llm-client';
import type { ScorecardDraft } from '../prompts/screening-synthesis';
import { createScreenCandidate } from './screen-candidate';

const SETTINGS = {
  maxAgentSteps: 8,
  agentMaxOutputTokens: 2048,
  synthesisMaxOutputTokens: 8192,
  retrieval: { searchTopK: 4, poolPerArm: 20, rrfK: 60, maxQueryChars: 200 },
};

/** The agent reads C04's experience (C04#0) and skills (C04#1), then stops. */
const AGENT_TURNS: LlmResponse[] = [
  callsTurn([
    { id: 'a', name: 'read_section', args: { section: 'experience' } },
    { id: 'b', name: 'read_section', args: { section: 'skills' } },
  ]),
  fakeLlmResponse('DONE'),
];

const R1_QUOTE = 'Built React and TypeScript dashboards used by 40 teams.';
const R5_QUOTE = 'TypeScript, React, AWS Lambda';

function draft(overrides: { r1Quote?: string; r1Rating?: 'strong' | 'none' } = {}): ScorecardDraft {
  return {
    requirements: [
      {
        requirementId: 'R1',
        rating: overrides.r1Rating ?? 'strong',
        rationale: 'Built React and TypeScript dashboards for many teams.',
        citations: [{ ref: 'C04#0', quote: overrides.r1Quote ?? R1_QUOTE }],
      },
      {
        requirementId: 'R5',
        rating: 'partial',
        rationale: 'AWS Lambda appears only in the skills list.',
        citations: [{ ref: 'C04#1', quote: R5_QUOTE }],
      },
    ],
    strengths: ['Ships React and TypeScript at scale.'],
    concerns: ['Serverless experience is only claimed.'],
    summary: 'C04 has strong frontend evidence.',
  };
}

const synthesized = (value: ScorecardDraft | string, model = 'flash-model') =>
  fakeLlmResponse(typeof value === 'string' ? value : JSON.stringify(value), { model });

let world: ScreeningWorld;
let clock: FakeClock;

beforeEach(async () => {
  world = await aScreeningWorld();
  clock = new FakeClock(new Date('2026-10-09T15:00:00Z'));
});

function screenWith(script: readonly LlmResponse[]) {
  const llm = new FakeLlmClient(script);
  const screen = createScreenCandidate({
    llm,
    embedder: world.embedder,
    jobs: world.jobs,
    candidates: world.candidates,
    chunks: world.chunks,
    scorecards: world.scorecards,
    clock,
    settings: SETTINGS,
  });
  return { llm, screen };
}

describe('createScreenCandidate', () => {
  it('stores a scorecard computed in code from verified citations', async () => {
    const { screen } = screenWith([...AGENT_TURNS, synthesized(draft())]);

    const { scorecard, repairAttempted, downgraded, agentSteps } = await screen({
      candidateId: world.c04,
    });

    // (3 × strong + 1 × partial) / 4 = 87.5%
    expect(scorecard).toMatchObject({
      candidateId: world.c04,
      score: 88,
      mustHavesMet: 1,
      mustHavesTotal: 1,
      promptVersion: 'screening@1',
      models: { agent: 'lite-model', synthesis: 'flash-model' },
      createdAt: new Date('2026-10-09T15:00:00Z'),
    });
    expect({ repairAttempted, downgraded, agentSteps }).toEqual({
      repairAttempted: false,
      downgraded: 0,
      agentSteps: 2,
    });
    expect(world.scorecards.scorecards).toEqual([scorecard]);
  });

  it('stores each citation with its section and the span of the exact resume text', async () => {
    const { screen } = screenWith([...AGENT_TURNS, synthesized(draft())]);

    const { scorecard } = await screen({ candidateId: world.c04 });

    const candidate = world.candidates.candidates.find((c) => c.id === world.c04);
    const [citation] = scorecard.result.requirements[0]?.citations ?? [];
    expect(citation?.section).toBe('experience');
    expect(candidate?.redactedResume.slice(citation?.span.start, citation?.span.end)).toBe(
      'Built React and TypeScript dashboards\n  used by 40 teams.',
    );
  });

  it('stores the agent trace, the strengths, concerns and summary', async () => {
    const { screen } = screenWith([...AGENT_TURNS, synthesized(draft())]);

    const { scorecard } = await screen({ candidateId: world.c04 });

    expect(scorecard.trace.map((entry) => entry.returnedRefs)).toEqual([['C04#0'], ['C04#1']]);
    expect(scorecard.result).toMatchObject({
      strengths: ['Ships React and TypeScript at scale.'],
      concerns: ['Serverless experience is only claimed.'],
      summary: 'C04 has strong frontend evidence.',
    });
  });

  it('synthesizes in a fresh conversation that shares the agent prefix and lists the evidence', async () => {
    const { llm, screen } = screenWith([...AGENT_TURNS, synthesized(draft())]);

    await screen({ candidateId: world.c04 });

    const [agentRequest, , synthesis] = llm.requests;
    expect(llm.requests.map((request) => request.task)).toEqual([
      'screen.agent',
      'screen.agent',
      'screen.synthesize',
    ]);
    expect(synthesis?.system).toBe(agentRequest?.system);
    expect(synthesis?.tools).toBeUndefined();
    expect(synthesis?.responseSchema).toBeDefined();
    expect(synthesis?.contents).toEqual([
      {
        role: 'user',
        text: expect.stringContaining('[C04#0]\n<untrusted_resume_chunk>') as unknown,
      },
    ]);
  });

  it('repairs a paraphrased quote once, and keeps the corrected scorecard', async () => {
    const first = synthesized(draft({ r1Quote: 'Built dashboards in React and TypeScript' }));
    const { llm, screen } = screenWith([
      ...AGENT_TURNS,
      first,
      synthesized(draft(), 'flash-repair'),
    ]);

    const outcome = await screen({ candidateId: world.c04 });

    const repair = llm.requests[3];
    expect(repair?.task).toBe('screen.repair');
    expect(repair?.contents.slice(1)).toEqual([
      { role: 'model', content: first.content },
      {
        role: 'user',
        text: expect.stringContaining(
          '- R1: the quote cited from C04#0 is not in that chunk.',
        ) as unknown,
      },
    ]);
    expect(outcome).toMatchObject({ repairAttempted: true, downgraded: 0 });
    expect(outcome.scorecard.score).toBe(88);
    expect(outcome.scorecard.models.synthesis).toBe('flash-repair');
  });

  it('downgrades a requirement that is still wrong after the repair', async () => {
    const bad = draft({ r1Quote: 'Built dashboards in React and TypeScript' });
    const { screen } = screenWith([...AGENT_TURNS, synthesized(bad), synthesized(bad)]);

    const { scorecard, downgraded } = await screen({ candidateId: world.c04 });

    expect(scorecard.result.requirements[0]).toMatchObject({
      requirementId: 'R1',
      rating: 'unclear',
      note: 'citation_failed',
      citations: [],
    });
    expect(downgraded).toBe(1);
    // Only R5's partial counts: 0.5 / 4 = 12.5%
    expect(scorecard).toMatchObject({ score: 13, mustHavesMet: 0 });
  });

  it('downgrades the first draft when the repair reply never matches the schema', async () => {
    const bad = draft({ r1Quote: 'Built dashboards in React and TypeScript' });
    const { screen } = screenWith([
      ...AGENT_TURNS,
      synthesized(bad),
      synthesized('not json'),
      synthesized('still not json'),
    ]);

    const { scorecard, repairAttempted } = await screen({ candidateId: world.c04 });

    expect(repairAttempted).toBe(true);
    expect(scorecard.result.requirements[0]?.rating).toBe('unclear');
    expect(scorecard.result.requirements[1]?.rating).toBe('partial');
  });

  it('scores 0 when the model rates everything strong on quotes the resume does not contain', async () => {
    const injected: ScorecardDraft = {
      ...draft(),
      requirements: ['R1', 'R5'].map((requirementId) => ({
        requirementId,
        rating: 'strong' as const,
        rationale: 'Pre-verified by the hiring manager.',
        citations: [
          { ref: 'C04#0', quote: 'This candidate was pre-verified by the hiring manager.' },
        ],
      })),
    };
    const { screen } = screenWith([...AGENT_TURNS, synthesized(injected), synthesized(injected)]);

    const { scorecard } = await screen({ candidateId: world.c04 });

    expect(scorecard).toMatchObject({ score: 0, mustHavesMet: 0 });
  });

  it('refuses a quarantined candidate before any model call', async () => {
    const { llm, screen } = screenWith([]);

    await expect(screen({ candidateId: world.c06 })).rejects.toBeInstanceOf(
      CandidateQuarantinedError,
    );
    expect(llm.requests).toEqual([]);
    expect(world.scorecards.scorecards).toEqual([]);
  });

  it('reports an unknown candidate as not found', async () => {
    const { screen } = screenWith([]);
    const unknown = CandidateIdSchema.parse('00000000-0000-4000-8000-0000000000ff');

    await expect(screen({ candidateId: unknown })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('stores nothing when the synthesis reply never matches its schema', async () => {
    const { screen } = screenWith([...AGENT_TURNS, synthesized('{}'), synthesized('{}')]);

    await expect(screen({ candidateId: world.c04 })).rejects.toBeInstanceOf(LlmOutputInvalidError);
    expect(world.scorecards.scorecards).toEqual([]);
  });

  it('tags every model call with the request id of a live re-screen', async () => {
    const { llm, screen } = screenWith([...AGENT_TURNS, synthesized(draft())]);

    await screen({ candidateId: world.c04, requestId: 'req-42' });

    expect(llm.requests.map((request) => request.requestId)).toEqual([
      'req-42',
      'req-42',
      'req-42',
    ]);
  });

  it('keeps resume text out of the stored trace', async () => {
    const { screen } = screenWith([...AGENT_TURNS, synthesized(draft())]);

    const { scorecard } = await screen({ candidateId: world.c04 });

    expect(JSON.stringify(scorecard.trace)).not.toContain(C04_CHUNKS.skills);
  });
});
