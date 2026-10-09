import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../../test/fakes/fake-clock';
import { FakeEmbedder } from '../../../../test/fakes/fake-embedder';
import { fakeLlmResponse } from '../../../../test/fakes/fake-llm-client';
import { FakeRoutedLlmClient } from '../../../../test/fakes/fake-routed-llm-client';
import { InMemoryFixtureStore } from '../../../../test/fakes/in-memory-fixture-store';
import { RecordingLogger } from '../../../../test/fakes/recording-logger';
import { routedRequest } from '../../../../test/helpers/llm-builders';
import { rehydrateRedactedText } from '../../../domain/redaction/redacted-text';
import { withEmbeddingFixtureFirst, withFixtureFirst } from './fixture-first';
import { createRecordingEmbedder } from './recording-embedder';
import { createRecordingLlmClient } from './recording-llm-client';
import { createReplayEmbedder } from './replay-embedder';
import { createReplayLlmClient } from './replay-llm-client';

const identity = { model: 'embedding-model', inputFormat: 'test-format@1' } as const;

function generationWorld() {
  const store = new InMemoryFixtureStore();
  const gemini = new FakeRoutedLlmClient([fakeLlmResponse('fresh'), fakeLlmResponse('again')]);
  const deps = { store, clock: new FakeClock(), logger: new RecordingLogger() };
  const client = withFixtureFirst(
    { replay: createReplayLlmClient(store), record: createRecordingLlmClient(gemini, deps) },
    store,
  );
  return { store, gemini, client };
}

describe('withFixtureFirst', () => {
  it('records a request that has no fixture yet', async () => {
    const { store, gemini, client } = generationWorld();

    const response = await client.generate(routedRequest());

    expect(response.text).toBe('fresh');
    expect(gemini.requests).toHaveLength(1);
    expect(store.fixtures.size).toBe(1);
  });

  it('replays a recorded request without calling Gemini again', async () => {
    const { gemini, client } = generationWorld();
    await client.generate(routedRequest());

    const replayed = await client.generate(routedRequest({ requestId: 'another-http-request' }));

    expect(replayed.text).toBe('fresh');
    expect(gemini.requests).toHaveLength(1);
  });

  it('records a changed request under its own key', async () => {
    const { store, gemini, client } = generationWorld();
    await client.generate(routedRequest());

    const changed = await client.generate(routedRequest({ promptVersion: 'test@2' }));

    expect(changed.text).toBe('again');
    expect(gemini.requests).toHaveLength(2);
    expect(store.fixtures.size).toBe(2);
  });
});

function embeddingWorld() {
  const store = new InMemoryFixtureStore();
  const gemini = new FakeEmbedder(4);
  const deps = { store, ...identity, clock: new FakeClock(), logger: new RecordingLogger() };
  const embedder = withEmbeddingFixtureFirst(
    {
      replay: createReplayEmbedder({ store, ...identity }),
      record: createRecordingEmbedder(gemini, deps),
    },
    { store, ...identity },
  );
  return { store, gemini, embedder };
}

describe('withEmbeddingFixtureFirst', () => {
  it('records new queries and replays known ones', async () => {
    const { store, gemini, embedder } = embeddingWorld();

    const recorded = await embedder.embedQuery('postgres at scale');
    const replayed = await embedder.embedQuery('postgres at scale');
    await embedder.embedQuery('kubernetes operators');

    expect(replayed).toEqual(recorded);
    expect(gemini.queries).toEqual(['postgres at scale', 'kubernetes operators']);
    expect(store.fixtures.size).toBe(2);
  });

  it('keys document batches as a whole, as the recorder writes them', async () => {
    const { gemini, embedder } = embeddingWorld();
    const batch = [rehydrateRedactedText('Built a RAG service.'), rehydrateRedactedText('Led 4.')];

    const recorded = await embedder.embedDocuments(batch);
    const replayed = await embedder.embedDocuments(batch);
    await embedder.embedDocuments(batch.slice(0, 1));

    expect(replayed).toEqual(recorded);
    expect(gemini.documentBatches).toHaveLength(2);
  });
});
