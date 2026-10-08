import {
  ApiError,
  FinishReason,
  type GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../../test/fakes/fake-clock';
import { LlmCallError } from '../../../application/llm/llm-call-error';
import { toModelContent } from '../../../application/llm/model-content';
import type { RoutedLlmRequest } from '../../../application/ports/routed-llm-client';
import { createGeminiLlmClient, type GeminiGenerateModels } from './gemini-llm-client';

class FakeGeminiModels implements GeminiGenerateModels {
  readonly calls: GenerateContentParameters[] = [];

  constructor(
    private readonly outcome: Partial<GenerateContentResponse> | Error,
    private readonly clock?: FakeClock,
  ) {}

  generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
    this.calls.push(params);
    this.clock?.advance(420);
    if (this.outcome instanceof Error) {
      return Promise.reject(this.outcome);
    }
    return Promise.resolve(Object.assign(new GenerateContentResponse(), this.outcome));
  }
}

const request: RoutedLlmRequest = {
  task: 'screen.agent',
  promptVersion: 'test@1',
  system: 'You are a careful screener.',
  contents: [{ role: 'user', text: 'Outline: C04' }],
  maxOutputTokens: 512,
  route: { tier: 'lite', model: 'gemini-lite-test', reason: 'default', isFallback: false },
};

const modelTurn = {
  role: 'model',
  parts: [
    { text: 'Thinking it over', thought: true },
    { functionCall: { id: 'call-1', name: 'search_resume', args: { query: 'kubernetes' } } },
    { text: 'Searching.', thoughtSignature: 'c2lnbmF0dXJl' },
  ],
};

function generate(outcome: Partial<GenerateContentResponse> | Error, req = request) {
  const clock = new FakeClock();
  const models = new FakeGeminiModels(outcome, clock);
  const client = createGeminiLlmClient({ models, clock, timeoutMs: 25_000 });
  return { models, result: client.generate(req) };
}

describe('GeminiLlmClient', () => {
  it('sends the routed model, system instruction, token limit and per-attempt timeout', async () => {
    const { models, result } = generate({ candidates: [{ content: modelTurn }] });
    await result;

    expect(models.calls[0]).toEqual({
      model: 'gemini-lite-test',
      contents: [{ role: 'user', parts: [{ text: 'Outline: C04' }] }],
      config: {
        httpOptions: { timeout: 25_000 },
        systemInstruction: 'You are a careful screener.',
        maxOutputTokens: 512,
      },
    });
  });

  it('sends tools as function declarations and a response schema as JSON Schema', async () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
    const { models, result } = generate(
      { candidates: [{ content: modelTurn }] },
      {
        ...request,
        temperature: 0.5,
        responseSchema: schema,
        tools: [{ name: 'read_section', description: 'Reads a section.', parameters: schema }],
      },
    );
    await result;

    expect(models.calls[0]?.config).toMatchObject({
      temperature: 0.5,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      tools: [
        {
          functionDeclarations: [
            { name: 'read_section', description: 'Reads a section.', parametersJsonSchema: schema },
          ],
        },
      ],
    });
  });

  it('sends a previous model turn back unchanged and tool results as function responses', async () => {
    const { models, result } = generate(
      { candidates: [{ content: modelTurn }] },
      {
        ...request,
        contents: [
          { role: 'model', content: toModelContent(modelTurn) },
          {
            role: 'tool',
            results: [
              { callId: 'call-1', name: 'search_resume', response: { chunks: [] } },
              { name: 'read_section', response: { chunks: [] } },
            ],
          },
        ],
      },
    );
    await result;

    expect(models.calls[0]?.contents).toEqual([
      modelTurn,
      {
        role: 'user',
        parts: [
          { functionResponse: { id: 'call-1', name: 'search_resume', response: { chunks: [] } } },
          { functionResponse: { name: 'read_section', response: { chunks: [] } } },
        ],
      },
    ]);
  });

  it('maps text without thoughts, function calls, usage including thinking, and latency', async () => {
    const { result } = generate({
      candidates: [{ content: modelTurn, finishReason: FinishReason.STOP }],
      usageMetadata: {
        promptTokenCount: 5000,
        candidatesTokenCount: 40,
        thoughtsTokenCount: 200,
        cachedContentTokenCount: 4096,
      },
    });

    await expect(result).resolves.toEqual({
      content: toModelContent(modelTurn),
      text: 'Searching.',
      functionCalls: [{ id: 'call-1', name: 'search_resume', args: { query: 'kubernetes' } }],
      usage: { inputTokens: 5000, outputTokens: 240, cachedTokens: 4096 },
      model: 'gemini-lite-test',
      latencyMs: 420,
      finishReason: 'stop',
    });
  });

  it('reports zero tokens when the provider omits usage', async () => {
    const { result } = generate({ candidates: [{ content: { role: 'model', parts: [] } }] });

    await expect(result).resolves.toMatchObject({
      text: '',
      functionCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      finishReason: 'other',
    });
  });

  it.each([
    [FinishReason.MAX_TOKENS, 'max_tokens'],
    [FinishReason.SAFETY, 'safety'],
    [FinishReason.PROHIBITED_CONTENT, 'safety'],
    [FinishReason.RECITATION, 'other'],
  ])('maps finish reason %s to %s', async (finishReason, expected) => {
    const { result } = generate({ candidates: [{ content: modelTurn, finishReason }] });

    await expect(result).resolves.toMatchObject({ finishReason: expected });
  });

  it('rejects a reply with no candidate, such as a blocked prompt', async () => {
    const { result } = generate({ candidates: [] });

    await expect(result).rejects.toMatchObject({ reason: 'rejected', retryable: false });
  });

  it('rejects a function call without a name', async () => {
    const { result } = generate({
      candidates: [{ content: { role: 'model', parts: [{ functionCall: { args: {} } }] } }],
    });

    await expect(result).rejects.toBeInstanceOf(LlmCallError);
  });

  it('translates SDK errors into retryable LlmCallErrors', async () => {
    const { result } = generate(new ApiError({ message: '{}', status: 503 }));

    await expect(result).rejects.toMatchObject({
      reason: 'unavailable',
      task: 'screen.agent',
      retryable: true,
    });
  });
});
