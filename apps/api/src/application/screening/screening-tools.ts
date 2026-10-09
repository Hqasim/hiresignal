import type { z } from 'zod';

import type { CandidateId } from '../../domain/candidates/candidate';
import type { JobId, RequirementId } from '../../domain/jobs/job';
import { capText } from '../llm/cap-text';
import type { JsonObject } from '../llm/json-value';
import type { ChunkRepository, RetrievedChunk, ScoredChunk } from '../ports/chunk-repository';
import type { Embedder } from '../ports/embedder';
import type { LlmFunctionCall } from '../ports/llm-client';
import { formatChunks } from '../prompts/format-chunks';
import {
  ReadSectionArgsSchema,
  type ScreeningToolName,
  searchResumeArgsSchema,
} from '../prompts/screening-agent';

/** Retrieval settings for `search_resume`, from `config/ai.ts`. */
export interface AgentRetrievalSettings {
  /** `AGENT_SEARCH_TOP_K`. */
  searchTopK: number;
  /** `RETRIEVAL_POOL_PER_ARM`. */
  poolPerArm: number;
  /** `RRF_K`. */
  rrfK: number;
  /** `SEARCH_QUERY_MAX_CHARS`. */
  maxQueryChars: number;
}

/** Dependencies of {@link createScreeningTools}. */
export interface ScreeningToolsDeps {
  embedder: Embedder;
  chunks: ChunkRepository;
  retrieval: AgentRetrievalSettings;
}

/**
 * What the tools may touch: one candidate of one job. The use case fixes it before the agent
 * starts, and no tool argument can change it (SPEC §9.4, LLM06).
 */
export interface ScreeningScope {
  jobId: JobId;
  candidateId: CandidateId;
  requirementIds: readonly RequirementId[];
  /** The candidate's section names, from the outline; `read_section` accepts only these. */
  sections: readonly string[];
}

/** The result of one tool call: what goes back to the model, and what goes into the trace. */
export interface ToolOutcome {
  /** The function response sent to the model: `{ result }` or `{ error }`. */
  response: JsonObject;
  /** The tool, for the trace; `null` for a name the agent was never offered. */
  tool: ScreeningToolName | null;
  /** The arguments as strings, for the trace. */
  args: Record<string, string>;
  /** Chunks returned, in the order the model saw them; empty on an error. */
  chunks: RetrievedChunk[];
}

/** Runs one function call from the agent. */
export type RunScreeningTool = (call: LlmFunctionCall) => Promise<ToolOutcome>;

/**
 * The agent's two read-only tools (SPEC §9.6), scoped to one candidate:
 *
 * - `search_resume` embeds the query (`embedQuery`: a query, not resume text) and runs hybrid
 *   search restricted to the candidate, returning up to `searchTopK` chunks.
 * - `read_section` returns every chunk of one of the candidate's sections.
 *
 * Arguments are validated with Zod. A bad argument, an unknown section or an unknown tool becomes
 * an `{ error }` response the model can recover from; it never throws. Results are spotlighted
 * chunks with their refs. No similarity scores reach the model, so the conversation, and with it
 * every fixture key, depends only on which chunks were found.
 *
 * @example
 * const run = createScreeningTools(deps, scope);
 * const outcome = await run({ name: 'read_section', args: { section: 'projects' } });
 */
export function createScreeningTools(
  deps: ScreeningToolsDeps,
  scope: ScreeningScope,
): RunScreeningTool {
  const searchArgs = searchResumeArgsSchema({
    requirementIds: scope.requirementIds,
    maxQueryChars: deps.retrieval.maxQueryChars,
  });
  const traceArgs = (call: LlmFunctionCall) => stringArgs(call, deps.retrieval.maxQueryChars);

  return async (call) => {
    switch (call.name) {
      case 'search_resume': {
        const parsed = searchArgs.safeParse(call.args);
        if (!parsed.success) {
          return failure('search_resume', traceArgs(call), argumentProblem(parsed.error));
        }
        const queryVector = await deps.embedder.embedQuery(parsed.data.query);
        const hits = await deps.chunks.hybridSearch({
          jobId: scope.jobId,
          candidateId: scope.candidateId,
          queryVector,
          queryText: parsed.data.query,
          // The agent writes short, focused phrases, so every word must match. Changing this would
          // change the agent's tool results, and with them every screening fixture key.
          keywordMatch: 'all',
          poolPerArm: deps.retrieval.poolPerArm,
          rrfK: deps.retrieval.rrfK,
          limit: deps.retrieval.searchTopK,
        });
        return success('search_resume', parsed.data, hits.map(withoutScores));
      }
      case 'read_section': {
        const parsed = ReadSectionArgsSchema.safeParse(call.args);
        if (!parsed.success) {
          return failure('read_section', traceArgs(call), argumentProblem(parsed.error));
        }
        const section = parsed.data.section.toLowerCase();
        if (!scope.sections.includes(section)) {
          return failure(
            'read_section',
            { section },
            `No section "${section}". Use one of: ${scope.sections.join(', ')}.`,
          );
        }
        const chunks = await deps.chunks.getSection(scope.candidateId, section);
        return success('read_section', { section }, chunks);
      }
      default:
        return failure(null, traceArgs(call), 'Unknown tool. Use search_resume or read_section.');
    }
  };
}

function success(
  tool: ScreeningToolName,
  args: Record<string, string>,
  chunks: RetrievedChunk[],
): ToolOutcome {
  return { response: { result: formatChunks(chunks) }, tool, args, chunks };
}

function failure(
  tool: ScreeningToolName | null,
  args: Record<string, string>,
  error: string,
): ToolOutcome {
  return { response: { error }, tool, args, chunks: [] };
}

/** Drops the hybrid-search scores: the model and the evidence set never see them. */
function withoutScores(hit: ScoredChunk): RetrievedChunk {
  return {
    ref: hit.ref,
    candidateId: hit.candidateId,
    alias: hit.alias,
    section: hit.section,
    contextHeader: hit.contextHeader,
    content: hit.content,
    startOffset: hit.startOffset,
    endOffset: hit.endOffset,
  };
}

/** Names the invalid arguments without echoing their values back. */
function argumentProblem(error: z.ZodError): string {
  const fields = [...new Set(error.issues.map((issue) => issue.path.join('.') || '(arguments)'))];
  return `Invalid arguments: ${fields.join(', ')}. Check the tool's parameters and try again.`;
}

/** The raw arguments as capped strings, so a malformed call still leaves a readable trace. */
function stringArgs(call: LlmFunctionCall, maxChars: number): Record<string, string> {
  return Object.fromEntries(
    Object.entries(call.args).map(([key, value]) => [
      key,
      capText(typeof value === 'string' ? value : JSON.stringify(value), maxChars),
    ]),
  );
}
