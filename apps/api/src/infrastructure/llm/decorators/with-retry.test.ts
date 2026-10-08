import { describe, expect, it } from 'vitest';

import { fakeLlmResponse, type ScriptedTurn } from '../../../../test/fakes/fake-llm-client';
import { FakeRoutedLlmClient } from '../../../../test/fakes/fake-routed-llm-client';
import { callError, routedRequest } from '../../../../test/helpers/llm-builders';
import { withRetry } from './with-retry';

function setup(script: readonly ScriptedTurn[], random = 0.5) {
  const inner = new FakeRoutedLlmClient(script);
  const sleeps: number[] = [];
  const client = withRetry(inner, {
    maxRetries: 1,
    baseDelayMs: 1000,
    maxDelayMs: 10_000,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => random,
  });
  return { inner, sleeps, client };
}

describe('withRetry', () => {
  it('returns the first answer without waiting', async () => {
    const { inner, sleeps, client } = setup([fakeLlmResponse('{}')]);

    await client.generate(routedRequest());

    expect(inner.requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it.each(['rate_limited', 'unavailable', 'timeout'] as const)(
    'retries once on the same tier after a %s failure',
    async (reason) => {
      const answer = fakeLlmResponse('{}');
      const { inner, client } = setup([callError(reason), answer]);

      const result = await client.generate(routedRequest());

      expect(result).toBe(answer);
      expect(inner.requests.map((request) => request.route.tier)).toEqual(['lite', 'lite']);
    },
  );

  it('waits exactly as long as the server asked', async () => {
    const { sleeps, client } = setup([callError('rate_limited', 7000), fakeLlmResponse('{}')]);

    await client.generate(routedRequest());

    expect(sleeps).toEqual([7000]);
  });

  it('skips the wait and rethrows when the server asks for longer than the cap', async () => {
    const tooLong = callError('rate_limited', 37_000);
    const { inner, sleeps, client } = setup([tooLong]);

    await expect(client.generate(routedRequest())).rejects.toBe(tooLong);
    expect(inner.requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it.each([
    [0, 500],
    [0.5, 750],
    [0.999, 1000],
  ])('backs off between half and all of the base delay (random %f → %i ms)', async (random, ms) => {
    const { sleeps, client } = setup([callError('unavailable'), fakeLlmResponse('{}')], random);

    await client.generate(routedRequest());

    expect(sleeps).toEqual([ms]);
  });

  it('gives up after one retry and rethrows the last failure', async () => {
    const last = callError('timeout');
    const { inner, client } = setup([callError('timeout'), last]);

    await expect(client.generate(routedRequest())).rejects.toBe(last);
    expect(inner.requests).toHaveLength(2);
  });

  it('never retries a rejected request', async () => {
    const rejected = callError('rejected');
    const { inner, client } = setup([rejected]);

    await expect(client.generate(routedRequest())).rejects.toBe(rejected);
    expect(inner.requests).toHaveLength(1);
  });

  it('never retries errors that are not provider failures', async () => {
    const bug = new Error('bug');
    const { inner, client } = setup([bug]);

    await expect(client.generate(routedRequest())).rejects.toBe(bug);
    expect(inner.requests).toHaveLength(1);
  });
});
