import type { ChunkRef } from '../../domain/candidates/chunk-ref';
import { joinRedactedText, type RedactedText } from '../../domain/redaction/redacted-text';
import { spotlight } from './spotlight';

/** A chunk as a prompt shows it: its ref, then its context header and content. */
export interface PromptChunk {
  ref: ChunkRef;
  contextHeader: RedactedText;
  content: RedactedText;
}

/**
 * Formats chunks for a prompt (screening tool results, the synthesis evidence set and ask): each
 * chunk's ref outside its wrapper, and its context header and content inside
 * `<untrusted_resume_chunk>`, so applicant text can't pose as a ref or close the wrapper. An
 * empty list says so explicitly.
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
