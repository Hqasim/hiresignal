import { z } from 'zod';

import type { RetrievedChunk, ScoredChunk } from '../../application/ports/chunk-repository';
import { CandidateAliasSchema, CandidateIdSchema } from '../../domain/candidates/candidate';
import { formatChunkRef } from '../../domain/candidates/chunk-ref';
import { rehydrateRedactedText } from '../../domain/redaction/redacted-text';

/** A `resume_chunks` row joined to its candidate's alias. The embedding is never selected. */
export const ChunkRowSchema = z.object({
  candidate_id: CandidateIdSchema,
  alias: CandidateAliasSchema,
  ordinal: z.number().int().nonnegative(),
  section: z.string(),
  context_header: z.string(),
  content: z.string(),
  start_offset: z.number().int().nonnegative(),
  end_offset: z.number().int().nonnegative(),
});
/** See {@link ChunkRowSchema}. */
export type ChunkRow = z.infer<typeof ChunkRowSchema>;

/** A hybrid-search row: a chunk plus its similarity and fused score. */
export const ScoredChunkRowSchema = ChunkRowSchema.extend({
  similarity: z.number(),
  rrf_score: z.number(),
});
/** See {@link ScoredChunkRowSchema}. */
export type ScoredChunkRow = z.infer<typeof ScoredChunkRowSchema>;

/** The columns {@link ChunkRowSchema} expects, from `resume_chunks c` joined to `candidates k`. */
export const CHUNK_COLUMNS = `c.candidate_id, k.alias, c.ordinal, c.section, c.context_header,
  c.content, c.start_offset, c.end_offset`;

/**
 * Maps a chunk row and derives its ref (`C04#3`). `content` and `context_header` are only ever
 * written from `RedactedText`, so their brand is restored here.
 *
 * @example
 * toRetrievedChunk(ChunkRowSchema.parse(row)).ref; // 'C04#3'
 */
export function toRetrievedChunk(row: ChunkRow): RetrievedChunk {
  return {
    ref: formatChunkRef(row.alias, row.ordinal),
    candidateId: row.candidate_id,
    alias: row.alias,
    section: row.section,
    contextHeader: rehydrateRedactedText(row.context_header),
    content: rehydrateRedactedText(row.content),
    startOffset: row.start_offset,
    endOffset: row.end_offset,
  };
}

/**
 * Maps a hybrid-search row.
 *
 * @example
 * toScoredChunk(ScoredChunkRowSchema.parse(row)).rrfScore;
 */
export function toScoredChunk(row: ScoredChunkRow): ScoredChunk {
  return { ...toRetrievedChunk(row), similarity: row.similarity, rrfScore: row.rrf_score };
}
