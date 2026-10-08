import { FixtureMissingError } from '../../../application/errors/fixture-missing-error';
import type { Embedder } from '../../../application/ports/embedder';
import type { RedactedText } from '../../../domain/redaction/redacted-text';
import type { EmbeddingTask } from '../../../domain/routing/llm-task';
import { toUnitVector, type UnitVector } from '../../../domain/vectors/unit-vector';
import { embeddingKeyPayload, fixtureKey } from './fixture-key';
import { EmbeddingFixtureSchema } from './fixture-schemas';
import type { FixtureStore } from './fixture-store';

/** Identifies the embedding requests a fixture belongs to. */
export interface EmbeddingFixtureIdentity {
  store: FixtureStore;
  /** `GEMINI_EMBEDDING_MODEL`. */
  model: string;
  /** The adapter's input format (`GEMINI_EMBEDDING_INPUT_FORMAT`); a new prefix means new keys. */
  inputFormat: string;
}

/**
 * `LLM_MODE=replay` for embeddings: returns recorded vectors, re-checked as unit vectors.
 *
 * @throws FixtureMissingError when nothing was recorded for these texts, model and format.
 *
 * @example
 * const embedder = createReplayEmbedder({ store, model, inputFormat });
 */
export function createReplayEmbedder(deps: EmbeddingFixtureIdentity): Embedder {
  async function replay(task: EmbeddingTask, texts: readonly string[]): Promise<UnitVector[]> {
    const key = fixtureKey('embed', deps.model, embeddingKeyPayload(task, deps.inputFormat, texts));
    const raw = await deps.store.read(task, key);
    if (raw === null) {
      throw new FixtureMissingError(task);
    }
    return EmbeddingFixtureSchema.parse(raw).response.vectors.map(toUnitVector);
  }

  return {
    embedDocuments: (texts: readonly RedactedText[]): Promise<UnitVector[]> =>
      replay('embed.documents', texts),
    async embedQuery(text: string): Promise<UnitVector> {
      const [vector] = await replay('embed.query', [text]);
      if (vector === undefined) {
        throw new FixtureMissingError('embed.query');
      }
      return vector;
    },
  };
}
