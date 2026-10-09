import type { CandidateAlias } from '../../domain/candidates/candidate';
import type { AgentTraceEntry } from '../../domain/scoring/scorecard';
import type { ChunkOutlineEntry, RetrievedChunk } from '../ports/chunk-repository';
import type { Clock } from '../ports/clock';
import type { LlmClient, LlmToolDeclaration, LlmToolResult, LlmTurn } from '../ports/llm-client';
import { buildAgentOpeningTurn } from '../prompts/screening-agent';
import { SCREENING_PROMPT_VERSION } from '../prompts/screening-prefix';
import type { RunScreeningTool } from './screening-tools';

/** Dependencies of {@link runScreeningAgent}. */
export interface ScreeningAgentDeps {
  llm: LlmClient;
  clock: Clock;
  /** The candidate-scoped tools (`createScreeningTools`). */
  runTool: RunScreeningTool;
  /** `MAX_AGENT_STEPS`. */
  maxSteps: number;
  /** `AGENT_MAX_OUTPUT_TOKENS`. */
  maxOutputTokens: number;
}

/** One agent run's inputs. */
export interface ScreeningAgentInput {
  alias: CandidateAlias;
  outline: readonly ChunkOutlineEntry[];
  /** The cacheable screening prefix (`buildScreeningPrefix`). */
  system: string;
  /** The job's tool declarations (`buildScreeningTools`). */
  tools: readonly LlmToolDeclaration[];
  /** The HTTP request behind a live re-screen, for `llm_calls`; absent when seeding. */
  requestId?: string;
}

/** What the agent gathered. Metadata and refs only in `trace`; chunk text only in `evidence`. */
export interface ScreeningAgentResult {
  /** Every chunk any tool returned, once each, in resume order: the synthesis evidence set. */
  evidence: RetrievedChunk[];
  /** One entry per tool call, in order. */
  trace: AgentTraceEntry[];
  /** The model that answered the last agent turn, after routing and any fallback. */
  model: string;
  /** Model turns taken, at most `maxSteps`. */
  steps: number;
}

/**
 * The evidence-gathering loop (SPEC §9.6, ADR 0020), task `screen.agent` (Flash-Lite):
 *
 * 1. Opens with the candidate's alias and spotlighted outline, after the cacheable prefix.
 * 2. Each model turn may call several tools. They run in order, and their results go back in one
 *    tool turn, after the model's own turn appended unchanged (Gemini 3 thought signatures).
 * 3. It stops when a turn calls no tools, or after `maxSteps` turns. Calls made on the last
 *    allowed turn still run, so their chunks join the evidence, but no further turn is sent.
 *
 * Every tool call is traced with its step, arguments, returned refs and latency; token usage sits
 * on the first call of each turn. The trace never holds resume text.
 *
 * @throws whatever the client or the tools' adapters throw (see `LlmClient`, `Embedder`).
 *
 * @example
 * const { evidence, trace } = await runScreeningAgent(deps, { alias, outline, system, tools });
 */
export async function runScreeningAgent(
  deps: ScreeningAgentDeps,
  input: ScreeningAgentInput,
): Promise<ScreeningAgentResult> {
  let contents: LlmTurn[] = [buildAgentOpeningTurn(input.alias, input.outline)];
  const trace: AgentTraceEntry[] = [];
  const evidence = new Map<string, RetrievedChunk>();
  let model = '';
  let steps = 0;

  while (steps < deps.maxSteps) {
    steps += 1;
    const response = await deps.llm.generate({
      task: 'screen.agent',
      promptVersion: SCREENING_PROMPT_VERSION,
      system: input.system,
      contents,
      tools: input.tools,
      maxOutputTokens: deps.maxOutputTokens,
      ...(input.requestId !== undefined && { requestId: input.requestId }),
    });
    model = response.model;
    if (response.functionCalls.length === 0) {
      break;
    }

    const results: LlmToolResult[] = [];
    for (const [index, call] of response.functionCalls.entries()) {
      const started = deps.clock.now().getTime();
      const outcome = await deps.runTool(call);
      const latencyMs = deps.clock.now().getTime() - started;
      results.push({
        ...(call.id !== undefined && { callId: call.id }),
        name: call.name,
        response: outcome.response,
      });
      for (const chunk of outcome.chunks) {
        if (!evidence.has(chunk.ref)) {
          evidence.set(chunk.ref, chunk);
        }
      }
      if (outcome.tool !== null) {
        trace.push({
          step: steps,
          tool: outcome.tool,
          args: outcome.args,
          returnedRefs: outcome.chunks.map((chunk) => chunk.ref),
          latencyMs,
          tokens:
            index === 0
              ? {
                  input: response.usage.inputTokens,
                  output: response.usage.outputTokens,
                  cached: response.usage.cachedTokens,
                }
              : null,
        });
      }
    }
    contents = [
      ...contents,
      { role: 'model', content: response.content },
      { role: 'tool', results },
    ];
  }

  return {
    evidence: [...evidence.values()].sort((a, b) => a.startOffset - b.startOffset),
    trace,
    model,
    steps,
  };
}
