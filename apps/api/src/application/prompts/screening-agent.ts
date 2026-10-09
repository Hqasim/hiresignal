import { z } from 'zod';

import type { CandidateAlias } from '../../domain/candidates/candidate';
import type { ChunkRef } from '../../domain/candidates/chunk-ref';
import type { RequirementId } from '../../domain/jobs/job';
import {
  joinRedactedText,
  labelWithRef,
  type RedactedText,
} from '../../domain/redaction/redacted-text';
import { toJsonSchema } from '../llm/json-schema';
import type { LlmToolDeclaration, LlmTurn } from '../ports/llm-client';
import { spotlight } from './spotlight';

/** One line of a candidate's outline: a chunk's ref and its context header, never its content. */
export interface OutlineEntry {
  ref: ChunkRef;
  contextHeader: RedactedText;
}

/** A chunk as the agent and the synthesis read it. */
export interface PromptChunk {
  ref: ChunkRef;
  contextHeader: RedactedText;
  content: RedactedText;
}

/** The name of a screening tool, as declared to the model and recorded in the trace. */
export type ScreeningToolName = 'search_resume' | 'read_section';

/**
 * Arguments of `search_resume` as the code accepts them. The query length is checked here rather
 * than in the declared schema, because Gemini doesn't document `maxLength` (SPEC §21 risk 4).
 */
export function searchResumeArgsSchema(options: {
  requirementIds: readonly RequirementId[];
  maxQueryChars: number;
}) {
  return z.object({
    query: z.string().trim().min(1).max(options.maxQueryChars),
    requirementId: z.string().refine((id) => options.requirementIds.includes(id), {
      message: 'Use one of the job requirement ids',
    }),
  });
}

/** Arguments of `read_section` as the code accepts them. */
export const ReadSectionArgsSchema = z.object({
  section: z.string().trim().min(1),
});

/**
 * The two read-only tools the agent may call (SPEC §9.6, LLM06). Both are scoped by the use case
 * to one candidate, which no argument can change. The declarations depend only on the job's
 * requirement ids, so every candidate of a job gets byte-identical tools.
 *
 * @example
 * const tools = buildScreeningTools(job.requirements.map((r) => r.id));
 */
export function buildScreeningTools(
  requirementIds: readonly RequirementId[],
): LlmToolDeclaration[] {
  return [
    {
      name: 'search_resume',
      description:
        "Hybrid semantic and keyword search over this candidate's resume. Returns the most relevant chunks, each labelled with its ref.",
      parameters: toJsonSchema(
        z.object({
          query: z
            .string()
            .describe(
              'A short phrase describing the evidence to find, in the words a resume would use.',
            ),
          requirementId: z
            .enum(requirementIds as [RequirementId, ...RequirementId[]])
            .describe('The id of the requirement this search looks for evidence of.'),
        }),
      ),
    },
    {
      name: 'read_section',
      description:
        "Returns every chunk of one section of this candidate's resume, in order, each labelled with its ref.",
      parameters: toJsonSchema(
        z.object({
          section: z
            .string()
            .describe('A section name from the outline, in lower case, for example "experience".'),
        }),
      ),
    },
  ];
}

/**
 * The agent's first turn (SPEC §9.6): the candidate's alias and outline. The outline is resume
 * text (role titles), so it is spotlighted. It comes after the cacheable prefix, so the prefix
 * stays identical across candidates.
 *
 * @example
 * const turn = buildAgentOpeningTurn(alias, outline);
 */
export function buildAgentOpeningTurn(
  alias: CandidateAlias,
  outline: readonly OutlineEntry[],
): LlmTurn {
  const lines = outline.map((entry) => labelWithRef(entry.ref, entry.contextHeader));
  return {
    role: 'user',
    text: [
      `Stage 1: gather evidence for candidate ${alias}.`,
      '',
      "The outline of the candidate's resume, one line per chunk:",
      '',
      spotlight(joinRedactedText(lines, '\n'), 'resume_outline'),
      '',
      'Search for evidence of every requirement, then reply DONE without tool calls.',
    ].join('\n'),
  };
}

/**
 * Formats chunks for a tool result or the evidence set: each chunk's ref outside its wrapper, and
 * its context header and content inside `<untrusted_resume_chunk>`, so applicant text can't pose
 * as a ref or close the wrapper. An empty list says so explicitly.
 *
 * @example
 * formatChunks([chunk]);
 * // '[C04#3]\n<untrusted_resume_chunk>\nC04 · Experience · …\n\n- Built …\n</untrusted_resume_chunk>'
 */
export function formatChunks(chunks: readonly PromptChunk[]): string {
  if (chunks.length === 0) {
    return 'No chunks found.';
  }
  return chunks
    .map(
      (chunk) =>
        `[${chunk.ref}]\n${spotlight(joinRedactedText([chunk.contextHeader, chunk.content], '\n\n'), 'resume_chunk')}`,
    )
    .join('\n\n');
}
