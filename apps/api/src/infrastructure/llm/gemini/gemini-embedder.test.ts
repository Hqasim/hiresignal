import { ApiError, type EmbedContentParameters, EmbedContentResponse } from '@google/genai';
import { describe, expect, it } from 'vitest';

import { rehydrateRedactedText } from '../../../domain/redaction/redacted-text';
import { createGeminiEmbedder, type GeminiEmbedModels } from './gemini-embedder';

const DIMENSIONS = 4;

/** Answers each request with one raw (unnormalized) vector per input, unless told otherwise. */
class FakeEmbedModels implements GeminiEmbedModels {
  readonly calls: EmbedContentParameters[] = [];
  vectorsPerRequest: number | null = null;
  failure: Error | null = null;
  dimensions = DIMENSIONS;

  embedContent(params: EmbedContentParameters): Promise<EmbedContentResponse> {
    this.calls.push(params);
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    const inputs = Array.isArray(params.contents) ? params.contents.length : 1;
    const count = this.vectorsPerRequest ?? inputs;
    const embeddings = Array.from({ length: count }, (_, index) => ({
      values: Array.from(
        { length: this.dimensions },
        (_unused, axis) => (axis === 0 ? 3 : 4) * (index + 1),
      ),
    }));
    return Promise.resolve(Object.assign(new EmbedContentResponse(), { embeddings }));
  }
}

function setup(batchSize = 2) {
  const models = new FakeEmbedModels();
  const embedder = createGeminiEmbedder({
    models,
    model: 'gemini-embedding-test',
    dimensions: DIMENSIONS,
    batchSize,
    timeoutMs: 25_000,
  });
  return { models, embedder };
}

// Test input only: synthetic text with no PII stands in for the output of redact().
const chunks = ['Led the platform team', 'Built CI pipelines', 'Ran Postgres upgrades'].map(
  rehydrateRedactedText,
);

describe('GeminiEmbedder', () => {
  it('sends each document as its own Content with the document prefix and requested size', async () => {
    const { models, embedder } = setup(8);

    await embedder.embedDocuments(chunks.slice(0, 2));

    expect(models.calls).toEqual([
      {
        model: 'gemini-embedding-test',
        contents: [
          { parts: [{ text: 'title: none | text: Led the platform team' }] },
          { parts: [{ text: 'title: none | text: Built CI pipelines' }] },
        ],
        config: { outputDimensionality: DIMENSIONS, httpOptions: { timeout: 25_000 } },
      },
    ]);
  });

  it('splits documents into batches and keeps their order', async () => {
    const { models, embedder } = setup(2);

    const vectors = await embedder.embedDocuments(chunks);

    expect(models.calls.map((call) => (call.contents as unknown[]).length)).toEqual([2, 1]);
    expect(vectors).toHaveLength(3);
  });

  it('makes no request for an empty list', async () => {
    const { models, embedder } = setup();

    await expect(embedder.embedDocuments([])).resolves.toEqual([]);
    expect(models.calls).toHaveLength(0);
  });

  it('returns unit vectors even when the model does not normalize', async () => {
    const { embedder } = setup();

    const [vector] = await embedder.embedDocuments(chunks.slice(0, 1));

    expect(Math.hypot(...(vector ?? []))).toBeCloseTo(1, 12);
  });

  it('sends a query with the search-result prefix', async () => {
    const { models, embedder } = setup();

    await embedder.embedQuery('Who has led a team?');

    expect(models.calls[0]?.contents).toEqual([
      { parts: [{ text: 'task: search result | query: Who has led a team?' }] },
    ]);
  });

  it('fails loudly when the provider merges several inputs into one embedding', async () => {
    const { models, embedder } = setup();
    models.vectorsPerRequest = 1;

    await expect(embedder.embedDocuments(chunks.slice(0, 2))).rejects.toMatchObject({
      reason: 'rejected',
      message: 'Gemini returned 1 embeddings for 2 inputs (embed.documents)',
    });
  });

  it('fails loudly when a vector has the wrong number of dimensions', async () => {
    const { models, embedder } = setup();
    models.dimensions = 3;

    await expect(embedder.embedQuery('Go experience')).rejects.toMatchObject({
      reason: 'rejected',
      task: 'embed.query',
    });
  });

  it('translates provider failures into LlmCallErrors', async () => {
    const { models, embedder } = setup();
    models.failure = new ApiError({ message: '{}', status: 429 });

    await expect(embedder.embedQuery('Go experience')).rejects.toMatchObject({
      reason: 'rate_limited',
      task: 'embed.query',
    });
  });
});
