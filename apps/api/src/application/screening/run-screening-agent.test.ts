import { beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from '../../../test/fakes/fake-clock';
import { FakeLlmClient, fakeLlmResponse } from '../../../test/fakes/fake-llm-client';
import {
  aScreeningWorld,
  C04_CHUNKS,
  callsTurn,
  type ScreeningWorld,
} from '../../../test/helpers/screening-world';
import { CandidateAliasSchema } from '../../domain/candidates/candidate';
import type { LlmResponse } from '../ports/llm-client';
import { buildScreeningTools } from '../prompts/screening-agent';
import { runScreeningAgent } from './run-screening-agent';
import { createScreeningTools, type RunScreeningTool } from './screening-tools';

const alias = CandidateAliasSchema.parse('C04');
const SYSTEM = 'screening prefix';
const TOOLS = buildScreeningTools(['R1', 'R5']);
const DONE = fakeLlmResponse('DONE');

const readSection = (section: string, id = section) => ({
  id,
  name: 'read_section',
  args: { section },
});
const search = (query: string, requirementId = 'R1') => ({
  id: query,
  name: 'search_resume',
  args: { query, requirementId },
});

let world: ScreeningWorld;
let clock: FakeClock;
let runTool: RunScreeningTool;

beforeEach(async () => {
  world = await aScreeningWorld();
  clock = new FakeClock();
  const tools = createScreeningTools(
    {
      embedder: world.embedder,
      chunks: world.chunks,
      retrieval: { searchTopK: 2, poolPerArm: 20, rrfK: 60, maxQueryChars: 200 },
    },
    {
      jobId: world.job.id,
      candidateId: world.c04,
      requirementIds: ['R1', 'R5'],
      sections: ['experience', 'skills', 'projects'],
    },
  );
  // Each tool call takes 15 ms of fake time, so latencies are visible in the trace.
  runTool = async (call) => {
    clock.advance(15);
    return tools(call);
  };
});

async function runAgent(script: readonly LlmResponse[], maxSteps = 8) {
  const llm = new FakeLlmClient(script);
  const outline = await world.chunks.listOutline(world.c04);
  const result = await runScreeningAgent(
    { llm, clock, runTool, maxSteps, maxOutputTokens: 2048 },
    { alias, outline, system: SYSTEM, tools: TOOLS },
  );
  return { llm, result };
}

describe('runScreeningAgent', () => {
  it('opens with the outline after the prefix, offering the tools, as task screen.agent', async () => {
    const { llm } = await runAgent([DONE]);

    expect(llm.requests[0]).toMatchObject({
      task: 'screen.agent',
      promptVersion: 'screening@1',
      system: SYSTEM,
      tools: TOOLS,
      maxOutputTokens: 2048,
    });
    expect(llm.requests[0]?.contents).toEqual([
      {
        role: 'user',
        text: expect.stringContaining('[C04#1] C04 · skills') as unknown,
      },
    ]);
  });

  it('stops at the first turn without tool calls', async () => {
    const { llm, result } = await runAgent([callsTurn([readSection('skills')]), DONE]);

    expect(llm.requests).toHaveLength(2);
    expect(result.steps).toBe(2);
    expect(result.evidence.map((chunk) => chunk.ref)).toEqual(['C04#1']);
  });

  it("appends the model's own turn unchanged, then every result of its parallel calls in one turn", async () => {
    const first = callsTurn([readSection('skills', 'call-1'), readSection('projects', 'call-2')]);

    const { llm } = await runAgent([first, DONE]);

    const contents = llm.requests[1]?.contents ?? [];
    expect(contents).toHaveLength(3);
    const modelTurn = contents[1];
    expect(modelTurn?.role === 'model' && modelTurn.content).toBe(first.content);
    expect(contents[2]).toEqual({
      role: 'tool',
      results: [
        {
          callId: 'call-1',
          name: 'read_section',
          response: { result: expect.any(String) as unknown },
        },
        {
          callId: 'call-2',
          name: 'read_section',
          response: { result: expect.any(String) as unknown },
        },
      ],
    });
  });

  it('omits the call id from a result when the model gave none', async () => {
    const { llm } = await runAgent([
      callsTurn([{ name: 'read_section', args: { section: 'skills' } }]),
      DONE,
    ]);

    const toolTurn = llm.requests[1]?.contents[2];
    expect(toolTurn?.role === 'tool' && toolTurn.results[0]).not.toHaveProperty('callId');
  });

  it('never takes more than the step limit, and keeps the evidence from the last allowed turn', async () => {
    const { llm, result } = await runAgent(
      [
        callsTurn([readSection('skills')]),
        callsTurn([readSection('projects')]),
        callsTurn([readSection('experience')]),
      ],
      2,
    );

    expect(llm.requests).toHaveLength(2);
    expect(result.steps).toBe(2);
    expect(result.evidence.map((chunk) => chunk.ref)).toEqual(['C04#1', 'C04#2']);
  });

  it('returns each chunk once, in resume order, however often and in whatever order it was found', async () => {
    const { result } = await runAgent([
      callsTurn([readSection('projects'), readSection('skills')]),
      callsTurn([readSection('skills'), readSection('experience')]),
      DONE,
    ]);

    expect(result.evidence.map((chunk) => chunk.ref)).toEqual(['C04#0', 'C04#1', 'C04#2']);
  });

  it('feeds a tool error back to the model and carries on', async () => {
    const { llm, result } = await runAgent([
      callsTurn([readSection('publications')]),
      callsTurn([readSection('skills')]),
      DONE,
    ]);

    const toolTurn = llm.requests[1]?.contents[2];
    expect(toolTurn?.role === 'tool' && toolTurn.results[0]?.response).toHaveProperty('error');
    expect(result.evidence.map((chunk) => chunk.ref)).toEqual(['C04#1']);
  });

  it('traces every call with its step, arguments, refs and latency, and tokens on the first call of a turn', async () => {
    const { result } = await runAgent([
      callsTurn([search('React dashboards'), readSection('skills')]),
      DONE,
    ]);

    expect(result.trace).toEqual([
      {
        step: 1,
        tool: 'search_resume',
        args: { query: 'React dashboards', requirementId: 'R1' },
        returnedRefs: expect.any(Array) as unknown,
        latencyMs: 15,
        tokens: { input: 5000, output: 40, cached: 4096 },
      },
      {
        step: 1,
        tool: 'read_section',
        args: { section: 'skills' },
        returnedRefs: ['C04#1'],
        latencyMs: 15,
        tokens: null,
      },
    ]);
  });

  it('keeps resume text out of the trace', async () => {
    const { result } = await runAgent([
      callsTurn([readSection('experience'), readSection('skills'), readSection('projects')]),
      DONE,
    ]);

    const trace = JSON.stringify(result.trace);
    for (const text of Object.values(C04_CHUNKS)) {
      expect(trace).not.toContain(text.slice(0, 20));
    }
  });

  it("never returns another candidate's chunks, whatever the model asks for", async () => {
    const { result } = await runAgent([
      callsTurn([search('React apps for a bank'), readSection('experience')]),
      DONE,
    ]);

    expect(result.evidence.every((chunk) => chunk.alias === 'C04')).toBe(true);
  });

  it('reports the model that answered the last agent turn', async () => {
    const { result } = await runAgent([
      callsTurn([readSection('skills')], { model: 'lite-model' }),
      fakeLlmResponse('DONE', { model: 'flash-model' }),
    ]);

    expect(result.model).toBe('flash-model');
  });
});
