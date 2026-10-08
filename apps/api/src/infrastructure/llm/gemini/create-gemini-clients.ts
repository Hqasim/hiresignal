import { GoogleGenAI } from '@google/genai';

import type { Clock } from '../../../application/ports/clock';
import type { Embedder } from '../../../application/ports/embedder';
import type { RoutedLlmClient } from '../../../application/ports/routed-llm-client';
import { createGeminiEmbedder } from './gemini-embedder';
import { createGeminiLlmClient } from './gemini-llm-client';

/** Settings for {@link createGeminiClients}, all from env and `config/ai.ts`. */
export interface GeminiClientSettings {
  apiKey: string;
  clock: Clock;
  timeoutMs: number;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingBatchSize: number;
}

/**
 * Builds the live Gemini clients over one SDK instance. Constructing it makes no network call,
 * so the composition root can do it at cold start and warm invocations reuse it.
 *
 * @example
 * const gemini = createGeminiClients({ apiKey, clock, timeoutMs: LLM_TIMEOUT_MS, … });
 */
export function createGeminiClients(settings: GeminiClientSettings): {
  llm: RoutedLlmClient;
  embedder: Embedder;
} {
  const { models } = new GoogleGenAI({ apiKey: settings.apiKey });
  return {
    llm: createGeminiLlmClient({ models, clock: settings.clock, timeoutMs: settings.timeoutMs }),
    embedder: createGeminiEmbedder({
      models,
      model: settings.embeddingModel,
      dimensions: settings.embeddingDimensions,
      batchSize: settings.embeddingBatchSize,
      timeoutMs: settings.timeoutMs,
    }),
  };
}
