import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../../test/fakes/fake-clock';
import { FakeEmbedder } from '../../../../test/fakes/fake-embedder';
import { fakeLlmResponse } from '../../../../test/fakes/fake-llm-client';
import { FakeRoutedLlmClient } from '../../../../test/fakes/fake-routed-llm-client';
import { InMemoryFixtureStore } from '../../../../test/fakes/in-memory-fixture-store';
import { RecordingLogger } from '../../../../test/fakes/recording-logger';
import { routedRequest } from '../../../../test/helpers/llm-builders';
import { FixtureMissingError } from '../../../application/errors';
import { rehydrateRedactedText } from '../../../domain/redaction/redacted-text';
import { createRecordingEmbedder } from './recording-embedder';
import { createRecordingLlmClient } from './recording-llm-client';
import { createReplayEmbedder } from './replay-embedder';
import { createReplayLlmClient } from './replay-llm-client';

const live = fakeLlmResponse('', {
  functionCalls: [
    { id: 'call-1', name: 'search_resume', args: { query: 'go' } },
    { name: 'read_section', args: { section: 'skills' } },
  ],
  usage: { inputTokens: 4500, outputTokens: 30, cachedTokens: 4096 },
  model: 'lite-model',
  latencyMs: 812,
  finishReason: 'stop',
});

function recorder() {
  const store = new InMemoryFixtureStore();
  const logger = new RecordingLogger();
  const client = createRecordingLlmClient(new FakeRoutedLlmClient([live]), {
    store,
    clock: new FakeClock(),
    logger,
  });
  return { store, logger, client };
}

describe('recording and replaying generations', () => {
  it('replays exactly what was recorded, without calling the live client', async () => {
    const { store, client } = recorder();
    const request = routedRequest({ task: 'screen.agent' });

    const recorded = await client.generate(request);
    const replayed = await createReplayLlmClient(store).generate(request);

    expect(recorded).toBe(live);
    expect(replayed).toEqual(live);
  });

  it('stores the fixture under the task with the SPEC 9.8 fields and logs only the key', async () => {
    const { store, logger, client } = recorder();

    await client.generate(routedRequest({ task: 'screen.agent' }));

    const [[path, fixture]] = [...store.fixtures.entries()] as [[string, Record<string, unknown>]];
    expect(path).toMatch(/^screen\.agent\/[0-9a-f]{64}$/);
    expect(Object.keys(fixture).sort()).toEqual(
      ['key', 'kind', 'model', 'recordedAt', 'response', 'task', 'usage'].sort(),
    );
    expect(fixture).toMatchObject({ recordedAt: '2026-10-08T12:00:00.000Z', model: 'lite-model' });
    expect(logger.entries).toEqual([
      {
        level: 'info',
        event: 'llm.fixture_recorded',
        fields: { task: 'screen.agent', key: path.split('/')[1] },
      },
    ]);
  });

  it('does not record a failed call', async () => {
    const store = new InMemoryFixtureStore();
    const failing = new FakeRoutedLlmClient([new Error('503')]);
    const client = createRecordingLlmClient(failing, {
      store,
      clock: new FakeClock(),
      logger: new RecordingLogger(),
    });

    await expect(client.generate(routedRequest())).rejects.toThrow('503');
    expect(store.fixtures.size).toBe(0);
  });

  it('tells the developer to re-record when a request was never recorded', async () => {
    const replay = createReplayLlmClient(new InMemoryFixtureStore());

    await expect(replay.generate(routedRequest({ task: 'guard.classify' }))).rejects.toThrow(
      new FixtureMissingError('guard.classify'),
    );
  });

  it('misses after a prompt change, so stale fixtures are never replayed', async () => {
    const { store, client } = recorder();
    await client.generate(routedRequest());

    const replay = createReplayLlmClient(store).generate(
      routedRequest({ promptVersion: 'test@2' }),
    );

    await expect(replay).rejects.toBeInstanceOf(FixtureMissingError);
  });

  it('rejects a corrupted fixture instead of replaying it', async () => {
    const { store, client } = recorder();
    await client.generate(routedRequest());
    for (const key of store.fixtures.keys()) {
      store.fixtures.set(key, { kind: 'generate', text: 'tampered' });
    }

    await expect(createReplayLlmClient(store).generate(routedRequest())).rejects.toThrow();
  });
});

describe('recording and replaying embeddings', () => {
  const identity = { model: 'embedding-model', inputFormat: 'prefixes@1' };
  // Test input only: synthetic text with no PII stands in for the output of redact().
  const chunks = ['Led the platform team', 'Built CI pipelines'].map(rehydrateRedactedText);

  function embeddingRecorder() {
    const store = new InMemoryFixtureStore();
    const embedder = createRecordingEmbedder(new FakeEmbedder(4), {
      ...identity,
      store,
      clock: new FakeClock(),
      logger: new RecordingLogger(),
    });
    return { store, embedder };
  }

  it('replays document and query vectors exactly as recorded', async () => {
    const { store, embedder } = embeddingRecorder();
    const documents = await embedder.embedDocuments(chunks);
    const query = await embedder.embedQuery('Who knows Go?');

    const replay = createReplayEmbedder({ ...identity, store });

    await expect(replay.embedDocuments(chunks)).resolves.toEqual(documents);
    await expect(replay.embedQuery('Who knows Go?')).resolves.toEqual(query);
  });

  it.each([
    ['another model', { model: 'other-model' }],
    ['another input format', { inputFormat: 'prefixes@2' }],
  ])('misses for %s', async (_label, change) => {
    const { store, embedder } = embeddingRecorder();
    await embedder.embedQuery('Who knows Go?');

    const replay = createReplayEmbedder({ ...identity, ...change, store });

    await expect(replay.embedQuery('Who knows Go?')).rejects.toThrow(
      new FixtureMissingError('embed.query'),
    );
  });

  it('misses for documents that were never embedded', async () => {
    const replay = createReplayEmbedder({ ...identity, store: new InMemoryFixtureStore() });

    await expect(replay.embedDocuments(chunks)).rejects.toThrow(
      new FixtureMissingError('embed.documents'),
    );
  });
});
