import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FakeLlmClient, fakeLlmResponse } from '../../../test/fakes/fake-llm-client';
import { LlmOutputInvalidError } from '../errors';
import { generateStructured, type StructuredRequest } from './generate-structured';

const VerdictSchema = z.object({
  label: z.enum(['positive', 'negative']),
  confidence: z.number().min(0).max(1),
});

const request: StructuredRequest<z.infer<typeof VerdictSchema>> = {
  task: 'platform.smoke',
  promptVersion: 'test@1',
  system: 'Classify the sentiment.',
  contents: [{ role: 'user', text: 'The deploy finished on time.' }],
  maxOutputTokens: 256,
  schema: VerdictSchema,
};

describe('generateStructured', () => {
  it('returns the parsed reply and sends the schema as JSON Schema', async () => {
    const llm = new FakeLlmClient([fakeLlmResponse('{"label":"positive","confidence":0.9}')]);

    const result = await generateStructured(llm, request);

    expect(result.value).toEqual({ label: 'positive', confidence: 0.9 });
    expect(result.responses).toHaveLength(1);
    expect(llm.requests[0]?.responseSchema).toMatchObject({
      type: 'object',
      required: ['label', 'confidence'],
    });
    expect(llm.requests[0]?.responseSchema).not.toHaveProperty('$schema');
  });

  it('repairs once, appending the model reply unchanged and then the exact problems', async () => {
    const invalid = fakeLlmResponse('{"label":"neutral","confidence":0.9}');
    const llm = new FakeLlmClient([
      invalid,
      fakeLlmResponse('{"label":"negative","confidence":0.4}'),
    ]);

    const result = await generateStructured(llm, request);

    expect(result.value).toEqual({ label: 'negative', confidence: 0.4 });
    expect(result.responses).toHaveLength(2);
    const repairContents = llm.requests[1]?.contents ?? [];
    expect(repairContents).toHaveLength(3);
    expect(repairContents[1]).toEqual({ role: 'model', content: invalid.content });
    expect(repairContents[2]).toMatchObject({
      role: 'user',
      text: expect.stringContaining('label: Invalid option') as string,
    });
  });

  it('tells the model when its reply was not JSON at all', async () => {
    const llm = new FakeLlmClient([
      fakeLlmResponse('Sure! Here is the JSON:'),
      fakeLlmResponse('{"label":"positive","confidence":1}'),
    ]);

    await generateStructured(llm, request);

    expect(llm.requests[1]?.contents[2]).toMatchObject({
      text: expect.stringContaining('not valid JSON') as string,
    });
  });

  it('tells the model when its reply was cut off at the token limit', async () => {
    const llm = new FakeLlmClient([
      fakeLlmResponse('{"label":"posi', { finishReason: 'max_tokens' }),
      fakeLlmResponse('{"label":"positive","confidence":1}'),
    ]);

    await generateStructured(llm, request);

    expect(llm.requests[1]?.contents[2]).toMatchObject({
      text: expect.stringContaining('cut off at the output token limit') as string,
    });
  });

  it('throws LlmOutputInvalidError when the repaired reply is still invalid', async () => {
    const llm = new FakeLlmClient([
      fakeLlmResponse('{"label":"neutral"}'),
      fakeLlmResponse('{"label":"neutral"}'),
    ]);

    await expect(generateStructured(llm, request)).rejects.toBeInstanceOf(LlmOutputInvalidError);
    expect(llm.requests).toHaveLength(2);
  });
});
