import { describe, expect, it } from 'vitest';

import { fakeLlmResponse } from '../../../../test/fakes/fake-llm-client';
import { FakeRoutedLlmClient } from '../../../../test/fakes/fake-routed-llm-client';
import { llmRequest, TEST_MODELS } from '../../../../test/helpers/llm-builders';
import { withPinnedRoute } from './with-pinned-route';
import { withRouting } from './with-routing';

const thresholds = { escalationContextTokens: 3000, escalationCandidates: 3 };

describe('withRouting', () => {
  it('sends a task to its default tier and model', async () => {
    const inner = new FakeRoutedLlmClient([fakeLlmResponse('{}')]);
    const llm = withRouting(inner, { thresholds, models: TEST_MODELS });

    await llm.generate(llmRequest({ task: 'screen.synthesize' }));

    expect(inner.requests[0]?.route).toEqual({
      tier: 'flash',
      model: 'flash-model',
      reason: 'default',
      isFallback: false,
    });
  });

  it('escalates using the routing context and records which rule fired', async () => {
    const inner = new FakeRoutedLlmClient([fakeLlmResponse('{}')]);
    const llm = withRouting(inner, { thresholds, models: TEST_MODELS });

    await llm.generate(llmRequest({ routingContext: { question: 'Rank the candidates' } }));

    expect(inner.requests[0]?.route).toMatchObject({
      tier: 'flash',
      model: 'flash-model',
      reason: 'comparative-intent',
    });
  });

  it('passes the request and the response through unchanged', async () => {
    const response = fakeLlmResponse('{"answer":"C02"}');
    const inner = new FakeRoutedLlmClient([response]);
    const llm = withRouting(inner, { thresholds, models: TEST_MODELS });
    const request = llmRequest();

    const result = await llm.generate(request);

    expect(result).toBe(response);
    expect(inner.requests[0]).toMatchObject(request);
  });
});

describe('withPinnedRoute', () => {
  it('sends every request to the pinned route, ignoring the routing policy', async () => {
    const inner = new FakeRoutedLlmClient([fakeLlmResponse('{}')]);
    const route = {
      tier: 'flash',
      model: 'flash-model',
      reason: 'default',
      isFallback: false,
    } as const;
    const llm = withPinnedRoute(inner, route);

    await llm.generate(llmRequest({ task: 'platform.smoke' }));

    expect(inner.requests[0]?.route).toEqual(route);
  });
});
