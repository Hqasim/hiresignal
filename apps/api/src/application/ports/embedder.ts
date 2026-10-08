import type { RedactedText } from '../../domain/redaction/redacted-text';
import type { UnitVector } from '../../domain/vectors/unit-vector';

/**
 * Turns text into unit-length embeddings for hybrid search (SPEC §7.2, ADR 0007).
 *
 * Resume text is accepted only as {@link RedactedText}, so raw PII can't reach the embedding
 * model. Queries are recruiter questions or agent search strings, not resume text.
 */
export interface Embedder {
  /**
   * Embeds resume chunks for storage.
   *
   * @returns one vector per input, in input order.
   * @throws LlmCallError if the provider fails or returns the wrong number or size of vectors.
   * @throws FixtureMissingError in replay mode when no recording matches.
   */
  embedDocuments(texts: readonly RedactedText[]): Promise<UnitVector[]>;
  /**
   * Embeds a search query.
   *
   * @throws LlmCallError if the provider fails.
   * @throws FixtureMissingError in replay mode when no recording matches.
   */
  embedQuery(text: string): Promise<UnitVector>;
}
