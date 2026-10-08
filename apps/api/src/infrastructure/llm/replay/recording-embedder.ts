import type { Clock } from '../../../application/ports/clock';
import type { Embedder } from '../../../application/ports/embedder';
import type { Logger } from '../../../application/ports/logger';
import type { RedactedText } from '../../../domain/redaction/redacted-text';
import type { EmbeddingTask } from '../../../domain/routing/llm-task';
import type { UnitVector } from '../../../domain/vectors/unit-vector';
import { embeddingKeyPayload, fixtureKey } from './fixture-key';
import type { EmbeddingFixture } from './fixture-schemas';
import type { EmbeddingFixtureIdentity } from './replay-embedder';

/** Dependencies of {@link createRecordingEmbedder}. */
export interface RecordingEmbedderDeps extends EmbeddingFixtureIdentity {
  clock: Clock;
  logger: Logger;
}

/**
 * `LLM_MODE=record` for embeddings: calls the live embedder and saves one fixture per call,
 * keyed by the texts, the model and the input format (SPEC §9.8).
 *
 * @example
 * const embedder = createRecordingEmbedder(gemini, { store, model, inputFormat, clock, logger });
 */
export function createRecordingEmbedder(live: Embedder, deps: RecordingEmbedderDeps): Embedder {
  async function record(
    task: EmbeddingTask,
    texts: readonly string[],
    vectors: readonly UnitVector[],
  ): Promise<void> {
    const key = fixtureKey('embed', deps.model, embeddingKeyPayload(task, deps.inputFormat, texts));
    const fixture: EmbeddingFixture = {
      kind: 'embed',
      key,
      task,
      model: deps.model,
      recordedAt: deps.clock.now().toISOString(),
      response: { vectors: vectors.map((vector) => [...vector]) },
      usage: null,
    };
    await deps.store.write(task, key, fixture);
    deps.logger.info('llm.fixture_recorded', { task, key });
  }

  return {
    async embedDocuments(texts: readonly RedactedText[]): Promise<UnitVector[]> {
      const vectors = await live.embedDocuments(texts);
      await record('embed.documents', texts, vectors);
      return vectors;
    },
    async embedQuery(text: string): Promise<UnitVector> {
      const vector = await live.embedQuery(text);
      await record('embed.query', [text], [vector]);
      return vector;
    },
  };
}
