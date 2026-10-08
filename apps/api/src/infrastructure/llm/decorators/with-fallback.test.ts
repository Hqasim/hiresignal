import { describe, expect, it } from 'vitest';

import { fakeLlmResponse } from '../../../../test/fakes/fake-llm-client';
import { FakeRoutedLlmClient } from '../../../../test/fakes/fake-routed-llm-client';
import { callError, routedRequest, TEST_MODELS } from '../../../../test/helpers/llm-builders';
import { LlmUnavailableError } from '../../../application/errors';
import { withFallback } from './with-fallback';

describe('withFallback', () => {
  it('returns the routed tier answer without touching the other tier', async () => {
    const inner = new FakeRoutedLlmClient([fakeLlmResponse('{}')]);

    await withFallback(inner, { models: TEST_MODELS }).generate(routedRequest());

    expect(inner.requests).toHaveLength(1);
  });

  it.each([
    ['lite', 'flash', 'flash-model'],
    ['flash', 'lite', 'lite-model'],
  ] as const)(
    'switches from %s to %s once when the routed tier is rate limited',
    async (from, to, model) => {
      const answer = fakeLlmResponse('{}', { model });
      const inner = new FakeRoutedLlmClient([callError('rate_limited'), answer]);
      const request = routedRequest({
        route: { tier: from, model: TEST_MODELS[from], reason: 'default', isFallback: false },
      });

      const result = await withFallback(inner, { models: TEST_MODELS }).generate(request);

      expect(result).toBe(answer);
      expect(inner.requests[1]?.route).toEqual({
        tier: to,
        model,
        reason: 'default',
        isFallback: true,
      });
    },
  );

  it('raises LlmUnavailableError when the fallback tier also fails transiently', async () => {
    const inner = new FakeRoutedLlmClient([callError('unavailable'), callError('timeout')]);

    const result = withFallback(inner, { models: TEST_MODELS }).generate(routedRequest());

    await expect(result).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(inner.requests).toHaveLength(2);
  });

  it('never falls back on a rejected request, which would fail on any tier', async () => {
    const rejected = callError('rejected');
    const inner = new FakeRoutedLlmClient([rejected]);

    const result = withFallback(inner, { models: TEST_MODELS }).generate(routedRequest());

    await expect(result).rejects.toBe(rejected);
    expect(inner.requests).toHaveLength(1);
  });

  it('passes a rejected fallback attempt through as it is', async () => {
    const rejected = callError('rejected');
    const inner = new FakeRoutedLlmClient([callError('rate_limited'), rejected]);

    const result = withFallback(inner, { models: TEST_MODELS }).generate(routedRequest());

    await expect(result).rejects.toBe(rejected);
  });

  it('passes errors that are not provider failures through, such as a missing fixture', async () => {
    const bug = new Error('not a provider failure');
    const inner = new FakeRoutedLlmClient([bug]);

    const result = withFallback(inner, { models: TEST_MODELS }).generate(routedRequest());

    await expect(result).rejects.toBe(bug);
  });
});
