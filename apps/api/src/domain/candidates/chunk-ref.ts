import { z } from 'zod';

import { type CandidateAlias, CandidateAliasSchema } from './candidate';

/** `C04#3`: candidate alias, `#`, chunk ordinal. Anchored, so surrounding text never parses. */
const CHUNK_REF = /^(C\d{2})#(0|[1-9]\d*)$/;

/**
 * Short, human-readable pointer to one resume chunk, for example `C04#3`. The model cites
 * evidence by ref, and code checks every ref against the chunks it actually retrieved.
 */
export const ChunkRefSchema = z
  .string()
  .regex(CHUNK_REF, 'Use <alias>#<ordinal>')
  .brand<'ChunkRef'>();
/** See {@link ChunkRefSchema}. */
export type ChunkRef = z.infer<typeof ChunkRefSchema>;

/** The parts of a {@link ChunkRef}. */
export interface ParsedChunkRef {
  alias: CandidateAlias;
  ordinal: number;
}

/**
 * Builds the ref for a candidate's chunk.
 *
 * @throws RangeError if `ordinal` isn't a non-negative integer.
 *
 * @example
 * formatChunkRef(alias, 3); // 'C04#3'
 */
export function formatChunkRef(alias: CandidateAlias, ordinal: number): ChunkRef {
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new RangeError(`Chunk ordinal must be a non-negative integer, got ${String(ordinal)}`);
  }
  return ChunkRefSchema.parse(`${alias}#${String(ordinal)}`);
}

/**
 * Splits a ref into alias and ordinal. Returns `null` for anything malformed, because refs also
 * arrive from model output, where a bad ref is an expected failure rather than a bug.
 *
 * @example
 * parseChunkRef('C04#3'); // { alias: 'C04', ordinal: 3 }
 * parseChunkRef('C04 #3'); // null
 */
export function parseChunkRef(text: string): ParsedChunkRef | null {
  const match = CHUNK_REF.exec(text);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  return { alias: CandidateAliasSchema.parse(match[1]), ordinal: Number(match[2]) };
}
