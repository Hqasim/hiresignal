import {
  type Content,
  FinishReason,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Part,
} from '@google/genai';

import { JsonObjectSchema, JsonValueSchema } from '../../../application/llm/json-value';
import { LlmCallError } from '../../../application/llm/llm-call-error';
import { toModelContent } from '../../../application/llm/model-content';
import type { Clock } from '../../../application/ports/clock';
import type {
  LlmFinishReason,
  LlmFunctionCall,
  LlmResponse,
  LlmTurn,
} from '../../../application/ports/llm-client';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../../application/ports/routed-llm-client';
import { toLlmCallError } from './gemini-errors';

/** The slice of the SDK's `ai.models` this adapter uses, so tests can pass a fake. */
export interface GeminiGenerateModels {
  generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
}

/** Dependencies of {@link createGeminiLlmClient}. */
export interface GeminiLlmClientDeps {
  models: GeminiGenerateModels;
  clock: Clock;
  /** Per-attempt timeout (`LLM_TIMEOUT_MS`). */
  timeoutMs: number;
}

/**
 * {@link RoutedLlmClient} on the Gemini API (`@google/genai`). It calls the model named in
 * `request.route` and maps between our provider-neutral types and the SDK's:
 *
 * - The model's turn is returned as opaque `content` and sent back byte for byte, which Gemini 3
 *   needs to verify thought signatures in function-calling loops (SPEC §9.6).
 * - Text and function calls are read from the parts directly. The SDK's `text` getter warns on
 *   the console whenever a reply also contains function calls.
 * - Failures become {@link LlmCallError}s; the SDK retries nothing on its own.
 *
 * @example
 * const gemini = createGeminiLlmClient({ models: new GoogleGenAI({ apiKey }).models, clock, timeoutMs });
 */
export function createGeminiLlmClient(deps: GeminiLlmClientDeps): RoutedLlmClient {
  return {
    async generate(request: RoutedLlmRequest): Promise<LlmResponse> {
      const started = deps.clock.now().getTime();
      let response: GenerateContentResponse;
      try {
        response = await deps.models.generateContent({
          model: request.route.model,
          contents: request.contents.map(toGeminiContent),
          config: toGeminiConfig(request, deps.timeoutMs),
        });
      } catch (error) {
        throw toLlmCallError(error, request.task);
      }
      return fromGeminiResponse(response, request, deps.clock.now().getTime() - started);
    },
  };
}

function toGeminiConfig(request: RoutedLlmRequest, timeoutMs: number): GenerateContentConfig {
  return {
    httpOptions: { timeout: timeoutMs },
    systemInstruction: request.system,
    maxOutputTokens: request.maxOutputTokens,
    ...(request.temperature !== undefined && { temperature: request.temperature }),
    ...(request.tools !== undefined && {
      tools: [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parametersJsonSchema: tool.parameters,
          })),
        },
      ],
    }),
    ...(request.responseSchema !== undefined && {
      responseMimeType: 'application/json',
      responseJsonSchema: request.responseSchema,
    }),
  };
}

function toGeminiContent(turn: LlmTurn): Content {
  switch (turn.role) {
    case 'user':
      return { role: 'user', parts: [{ text: turn.text }] };
    case 'model':
      // A turn Gemini produced, round-tripped through JSON unchanged; see toModelContent.
      return turn.content.raw as Content;
    case 'tool':
      return {
        role: 'user',
        parts: turn.results.map((result) => ({
          functionResponse: {
            ...(result.callId !== undefined && { id: result.callId }),
            name: result.name,
            response: result.response,
          },
        })),
      };
  }
}

function fromGeminiResponse(
  response: GenerateContentResponse,
  request: RoutedLlmRequest,
  latencyMs: number,
): LlmResponse {
  const candidate = response.candidates?.[0];
  if (candidate?.content === undefined) {
    throw new LlmCallError(`Gemini returned no candidate for ${request.task}`, {
      reason: 'rejected',
      task: request.task,
    });
  }
  const parts = candidate.content.parts ?? [];
  const usage = response.usageMetadata;
  return {
    // JSON round trip: drops undefined fields so the turn can be hashed, stored and replayed.
    content: toModelContent(JsonValueSchema.parse(JSON.parse(JSON.stringify(candidate.content)))),
    text: parts
      .filter((part) => part.thought !== true)
      .map((part) => part.text ?? '')
      .join(''),
    functionCalls: parts.flatMap((part) => toFunctionCall(part, request)),
    usage: {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      cachedTokens: usage?.cachedContentTokenCount ?? 0,
    },
    model: request.route.model,
    latencyMs,
    finishReason: toFinishReason(candidate.finishReason),
  };
}

function toFunctionCall(part: Part, request: RoutedLlmRequest): LlmFunctionCall[] {
  const call = part.functionCall;
  if (call === undefined) {
    return [];
  }
  if (call.name === undefined) {
    throw new LlmCallError(`Gemini returned a function call without a name for ${request.task}`, {
      reason: 'rejected',
      task: request.task,
    });
  }
  return [
    {
      ...(call.id !== undefined && { id: call.id }),
      name: call.name,
      args: JsonObjectSchema.parse(call.args ?? {}),
    },
  ];
}

function toFinishReason(reason: FinishReason | undefined): LlmFinishReason {
  switch (reason) {
    case FinishReason.STOP:
      return 'stop';
    case FinishReason.MAX_TOKENS:
      return 'max_tokens';
    case FinishReason.SAFETY:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.BLOCKLIST:
    case FinishReason.SPII:
      return 'safety';
    default:
      return 'other';
  }
}
