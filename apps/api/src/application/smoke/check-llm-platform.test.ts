import { describe, expect, it } from 'vitest';

import { FakeEmbedder } from '../../../test/fakes/fake-embedder';
import { FakeLlmClient, fakeLlmResponse } from '../../../test/fakes/fake-llm-client';
import { LlmOutputInvalidError } from '../errors';
import { PROMPT_VERSION, SMOKE_QUERY } from '../prompts/smoke';
import { createCheckLlmPlatform } from './check-llm-platform';

const valid = '{"sentiment":"positive","confidence":0.95}';

describe('checkLlmPlatform', () => {
  it('reports each tier and the embedding size, without any model output', async () => {
    const lite = new FakeLlmClient([fakeLlmResponse(valid, { model: 'lite-model' })]);
    const flash = new FakeLlmClient([
      fakeLlmResponse('{"sentiment":"great"}', { model: 'flash-model', latencyMs: 300 }),
      fakeLlmResponse(valid, { model: 'flash-model', latencyMs: 200 }),
    ]);
    const embedder = new FakeEmbedder(768);
    const check = createCheckLlmPlatform({ lite, flash, embedder, maxOutputTokens: 2048 });

    const report = await check();

    expect(report).toEqual({
      generations: [
        {
          tier: 'lite',
          model: 'lite-model',
          attempts: 1,
          inputTokens: 100,
          outputTokens: 20,
          cachedTokens: 0,
          latencyMs: 50,
        },
        {
          tier: 'flash',
          model: 'flash-model',
          attempts: 2,
          inputTokens: 200,
          outputTokens: 40,
          cachedTokens: 0,
          latencyMs: 500,
        },
      ],
      embedding: { dimensions: 768 },
    });
    expect(JSON.stringify(report)).not.toContain('positive');
  });

  it('sends the fixed smoke prompt with its version, schema and token budget', async () => {
    const lite = new FakeLlmClient([fakeLlmResponse(valid)]);
    const flash = new FakeLlmClient([fakeLlmResponse(valid)]);
    const embedder = new FakeEmbedder(8);

    await createCheckLlmPlatform({ lite, flash, embedder, maxOutputTokens: 2048 })();

    expect(lite.requests[0]).toMatchObject({
      task: 'platform.smoke',
      promptVersion: PROMPT_VERSION,
      maxOutputTokens: 2048,
      responseSchema: { type: 'object' },
    });
    expect(flash.requests[0]).toEqual(lite.requests[0]);
    expect(embedder.queries).toEqual([SMOKE_QUERY]);
  });

  it('fails when a tier never returns schema-valid JSON', async () => {
    const lite = new FakeLlmClient([fakeLlmResponse('nope'), fakeLlmResponse('still nope')]);
    const check = createCheckLlmPlatform({
      lite,
      flash: new FakeLlmClient([]),
      embedder: new FakeEmbedder(8),
      maxOutputTokens: 2048,
    });

    await expect(check()).rejects.toBeInstanceOf(LlmOutputInvalidError);
  });
});
