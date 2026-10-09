import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../../test/fakes/fake-clock';
import { FakeEmbedder } from '../../../../test/fakes/fake-embedder';
import { fakeLlmResponse } from '../../../../test/fakes/fake-llm-client';
import { FakeRoutedLlmClient } from '../../../../test/fakes/fake-routed-llm-client';
import { routedRequest } from '../../../../test/helpers/llm-builders';
import { rehydrateRedactedText } from '../../../domain/redaction/redacted-text';
import { createThrottle, withEmbeddingThrottle, withThrottle } from './with-throttle';

function setup(minIntervalMs = 6000) {
  const clock = new FakeClock();
  const sleeps: number[] = [];
  const throttle = createThrottle({
    minIntervalMs,
    clock,
    sleep: (ms) => {
      sleeps.push(ms);
      clock.advance(ms);
      return Promise.resolve();
    },
  });
  return { clock, sleeps, throttle };
}

describe('createThrottle', () => {
  it('lets the first call start at once', async () => {
    const { throttle, sleeps } = setup();

    await throttle.wait();

    expect(sleeps).toEqual([]);
  });

  it('waits out the rest of the interval before the next call', async () => {
    const { throttle, sleeps, clock } = setup();
    await throttle.wait();
    clock.advance(1500);

    await throttle.wait();

    expect(sleeps).toEqual([4500]);
  });

  it('does not wait when the interval has already passed', async () => {
    const { throttle, sleeps, clock } = setup();
    await throttle.wait();
    clock.advance(7000);

    await throttle.wait();

    expect(sleeps).toEqual([]);
  });

  it('queues concurrent callers one interval apart', async () => {
    const clock = new FakeClock();
    const sleeps: number[] = [];
    const throttle = createThrottle({
      minIntervalMs: 1000,
      clock,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    await Promise.all([throttle.wait(), throttle.wait(), throttle.wait()]);

    expect(sleeps).toEqual([1000, 2000]);
  });
});

describe('withThrottle and withEmbeddingThrottle', () => {
  it('space generation and embedding calls with one shared throttle', async () => {
    const { throttle, sleeps } = setup(6000);
    const llm = withThrottle(new FakeRoutedLlmClient([fakeLlmResponse('{}')]), throttle);
    const embedder = withEmbeddingThrottle(new FakeEmbedder(), throttle);

    await llm.generate(routedRequest());
    await embedder.embedDocuments([rehydrateRedactedText('C01 · Summary\nBuilds APIs.')]);
    await embedder.embedQuery('Who knows Postgres?');

    expect(sleeps).toEqual([6000, 6000]);
  });
});
