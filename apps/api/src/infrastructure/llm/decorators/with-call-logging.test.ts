import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../../test/fakes/fake-clock';
import { FakeEmbedder } from '../../../../test/fakes/fake-embedder';
import { fakeLlmResponse } from '../../../../test/fakes/fake-llm-client';
import { FakeRoutedLlmClient } from '../../../../test/fakes/fake-routed-llm-client';
import { InMemoryLlmCallRepository } from '../../../../test/fakes/in-memory-llm-call-repository';
import { RecordingLogger } from '../../../../test/fakes/recording-logger';
import { callError, routedRequest } from '../../../../test/helpers/llm-builders';
import type { Embedder } from '../../../application/ports/embedder';
import type { LlmResponse } from '../../../application/ports/llm-client';
import type { RoutedLlmRequest } from '../../../application/ports/routed-llm-client';
import { withCallLogging, withEmbeddingCallLogging } from './with-call-logging';

function setup(outcome: LlmResponse | Error) {
  const clock = new FakeClock();
  const calls = new InMemoryLlmCallRepository();
  const logger = new RecordingLogger();
  const fake = new FakeRoutedLlmClient([outcome]);
  // Each attempt takes 300 ms of fake time.
  const inner = {
    generate: (request: RoutedLlmRequest) => {
      clock.advance(300);
      return fake.generate(request);
    },
  };
  const client = withCallLogging(inner, { calls, clock, source: 'live', logger });
  return { calls, logger, client };
}

describe('withCallLogging', () => {
  it('records one row with route, tokens, cached tokens and latency for a successful call', async () => {
    const { calls, client } = setup(
      fakeLlmResponse('{}', { usage: { inputTokens: 5000, outputTokens: 80, cachedTokens: 4096 } }),
    );

    await client.generate(
      routedRequest({
        task: 'screen.synthesize',
        promptVersion: 'screening@1',
        requestId: 'req-1',
        route: { tier: 'flash', model: 'flash-model', reason: 'default', isFallback: true },
      }),
    );

    expect(calls.rows).toEqual([
      {
        requestId: 'req-1',
        task: 'screen.synthesize',
        model: 'flash-model',
        tier: 'flash',
        routedReason: 'default',
        isFallback: true,
        source: 'live',
        status: 'ok',
        inputTokens: 5000,
        outputTokens: 80,
        cachedTokens: 4096,
        latencyMs: 300,
        promptVersion: 'screening@1',
        createdAt: new Date('2026-10-08T12:00:00.300Z'),
      },
    ]);
  });

  it.each([
    ['rate_limited', 'rate_limited'],
    ['timeout', 'timeout'],
    ['unavailable', 'error'],
    ['rejected', 'error'],
  ] as const)(
    'records a failed %s attempt with status %s and rethrows it',
    async (reason, status) => {
      const failure = callError(reason);
      const { calls, client } = setup(failure);

      await expect(client.generate(routedRequest())).rejects.toBe(failure);
      expect(calls.rows).toHaveLength(1);
      expect(calls.rows[0]).toMatchObject({
        status,
        requestId: null,
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        latencyMs: 300,
      });
    },
  );

  it('still returns the model answer when the telemetry write fails, and logs the failure', async () => {
    const answer = fakeLlmResponse('{}');
    const { calls, logger, client } = setup(answer);
    calls.failure = new Error('database unreachable');

    await expect(client.generate(routedRequest())).resolves.toBe(answer);
    expect(logger.entries).toMatchObject([
      {
        level: 'error',
        event: 'llm.call_log_failed',
        fields: { task: 'ask.answer', status: 'ok' },
      },
    ]);
  });
});

describe('withEmbeddingCallLogging', () => {
  function setupEmbedder(inner: Embedder = new FakeEmbedder(4)) {
    const calls = new InMemoryLlmCallRepository();
    const embedder = withEmbeddingCallLogging(inner, {
      calls,
      clock: new FakeClock(),
      source: 'replay',
      logger: new RecordingLogger(),
      model: 'embedding-model',
      inputFormat: 'prefixes@1',
    });
    return { calls, embedder };
  }

  it('records each embedding call with the embedding tier and the input format', async () => {
    const { calls, embedder } = setupEmbedder();

    await embedder.embedQuery('Who knows Go?');

    expect(calls.rows).toEqual([
      expect.objectContaining({
        task: 'embed.query',
        model: 'embedding-model',
        tier: 'embedding',
        routedReason: 'default',
        source: 'replay',
        status: 'ok',
        inputTokens: null,
        promptVersion: 'prefixes@1',
      }),
    ]);
  });

  it('records a failed document batch and rethrows', async () => {
    const failure = callError('rate_limited');
    const failing: Embedder = {
      embedDocuments: () => Promise.reject(failure),
      embedQuery: () => Promise.reject(failure),
    };
    const { calls, embedder } = setupEmbedder(failing);

    await expect(embedder.embedDocuments([])).rejects.toBe(failure);
    expect(calls.rows[0]).toMatchObject({ task: 'embed.documents', status: 'rate_limited' });
  });
});
