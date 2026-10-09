import type { RedactedText } from '../redaction/redacted-text';
import type { UnitVector } from '../vectors/unit-vector';

/**
 * One retrievable piece of a redacted resume: a role or a section, small enough to embed
 * (SPEC §9.5). `content` is the exact slice `[startOffset, endOffset)` of the candidate's
 * redacted resume, which is what lets citations be highlighted in place.
 */
export interface ResumeChunk {
  /** Position within the candidate's resume, from 0; also the number in the ref `C04#3`. */
  ordinal: number;
  /** Lowercase section name, for example `experience` or `projects`. */
  section: string;
  /**
   * Embedded with the content so short chunks keep their context, for example
   * `C04 · Experience · …`. Built from the alias and redacted headings, so it is redacted too.
   */
  contextHeader: RedactedText;
  content: RedactedText;
  startOffset: number;
  endOffset: number;
  tokenEstimate: number;
}

/** A chunk ready to store: the chunk plus the embedding of `contextHeader + content`. */
export interface EmbeddedChunk extends ResumeChunk {
  embedding: UnitVector;
}
