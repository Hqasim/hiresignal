import type { EmbedContentParameters, EmbedContentResponse } from '@google/genai';

import { LlmCallError } from '../../../application/llm/llm-call-error';
import type { Embedder } from '../../../application/ports/embedder';
import type { RedactedText } from '../../../domain/redaction/redacted-text';
import type { EmbeddingTask } from '../../../domain/routing/llm-task';
import { normalize, type UnitVector } from '../../../domain/vectors/unit-vector';
import { toLlmCallError } from './gemini-errors';

/**
 * The text format this adapter sends. It goes into record/replay fixture keys, so changing the
 * prefixes below must change this version, and the fixtures must be re-recorded (ADR 0007, 0009).
 */
export const GEMINI_EMBEDDING_INPUT_FORMAT = 'gemini-embedding-2-retrieval-prefixes@1';

/** `gemini-embedding-2` takes retrieval intent as a text prefix, not a task type (ADR 0007). */
const documentInput = (text: string): string => `title: none | text: ${text}`;
const queryInput = (text: string): string => `task: search result | query: ${text}`;

/** The slice of the SDK's `ai.models` this adapter uses, so tests can pass a fake. */
export interface GeminiEmbedModels {
  embedContent(params: EmbedContentParameters): Promise<EmbedContentResponse>;
}

/** Dependencies of {@link createGeminiEmbedder}. */
export interface GeminiEmbedderDeps {
  models: GeminiEmbedModels;
  /** `GEMINI_EMBEDDING_MODEL`. */
  model: string;
  /** `EMBEDDING_DIMENSIONS`; every returned vector must have exactly this many components. */
  dimensions: number;
  /** `EMBEDDING_BATCH_SIZE`: documents per request. */
  batchSize: number;
  /** Per-request timeout (`LLM_TIMEOUT_MS`). */
  timeoutMs: number;
}

/**
 * {@link Embedder} on the Gemini API.
 *
 * - Each text is its own `Content` object. Passing plain strings would merge them into one
 *   embedding, so the adapter also checks it gets back exactly one vector per input.
 * - Vectors are requested at `dimensions` and normalized again before they become `UnitVector`s.
 *
 * @example
 * const embedder = createGeminiEmbedder({ models: ai.models, model, dimensions: 768, batchSize: 16, timeoutMs });
 */
export function createGeminiEmbedder(deps: GeminiEmbedderDeps): Embedder {
  async function embedBatch(inputs: readonly string[], task: EmbeddingTask): Promise<UnitVector[]> {
    let response: EmbedContentResponse;
    try {
      response = await deps.models.embedContent({
        model: deps.model,
        contents: inputs.map((text) => ({ parts: [{ text }] })),
        config: { outputDimensionality: deps.dimensions, httpOptions: { timeout: deps.timeoutMs } },
      });
    } catch (error) {
      throw toLlmCallError(error, task);
    }
    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== inputs.length) {
      throw new LlmCallError(
        `Gemini returned ${String(embeddings.length)} embeddings for ${String(inputs.length)} inputs (${task})`,
        { reason: 'rejected', task },
      );
    }
    return embeddings.map((embedding) => {
      const values = embedding.values ?? [];
      if (values.length !== deps.dimensions) {
        throw new LlmCallError(
          `Gemini returned a ${String(values.length)}-dimension embedding; expected ${String(deps.dimensions)} (${task})`,
          { reason: 'rejected', task },
        );
      }
      return normalize(values);
    });
  }

  return {
    async embedDocuments(texts: readonly RedactedText[]): Promise<UnitVector[]> {
      const vectors: UnitVector[] = [];
      for (let start = 0; start < texts.length; start += deps.batchSize) {
        const batch = texts.slice(start, start + deps.batchSize).map(documentInput);
        // Sequential on purpose: free-tier limits are per minute, and order must be preserved.
        vectors.push(...(await embedBatch(batch, 'embed.documents')));
      }
      return vectors;
    },

    async embedQuery(text: string): Promise<UnitVector> {
      const [vector] = await embedBatch([queryInput(text)], 'embed.query');
      if (vector === undefined) {
        // Unreachable: embedBatch checked there is exactly one vector per input.
        throw new LlmCallError('Gemini returned no embedding for embed.query', {
          reason: 'rejected',
          task: 'embed.query',
        });
      }
      return vector;
    },
  };
}
