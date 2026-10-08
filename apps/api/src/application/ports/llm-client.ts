import type { LlmTask } from '../../domain/routing/llm-task';
import type { RoutingContext } from '../../domain/routing/policy';
import type { JsonObject, JsonValue } from '../llm/json-value';

declare const providerTurn: unique symbol;

/**
 * A model turn exactly as the provider returned it. Callers never build or edit one: they append
 * `LlmResponse.content` to the next request unchanged, because Gemini 3 rejects a function-calling
 * history whose thought signatures were dropped or rebuilt (SPEC §9.6). Only adapters create it,
 * through `toModelContent`.
 */
export type ModelContent = { readonly raw: JsonValue } & { readonly [providerTurn]: true };

/** One turn of the conversation sent to the model. */
export type LlmTurn =
  /** Prompt text from a prompt builder. Untrusted parts are already spotlighted. */
  | { role: 'user'; text: string }
  /** A previous model reply, appended unchanged. */
  | { role: 'model'; content: ModelContent }
  /** Results of the function calls in the previous model turn. */
  | { role: 'tool'; results: readonly LlmToolResult[] };

/** A function the model may call (Gemini function declaration). */
export interface LlmToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema of the arguments. Keep it flat: Gemini supports a subset of JSON Schema. */
  parameters: JsonObject;
}

/** A function call the model asked for. Arguments are untrusted until a Zod schema parses them. */
export interface LlmFunctionCall {
  /** Provider call id, echoed back in the matching {@link LlmToolResult} when present. */
  id?: string;
  name: string;
  args: JsonObject;
}

/** The answer to one {@link LlmFunctionCall}. */
export interface LlmToolResult {
  /** The `id` of the call this answers, when the call had one. */
  callId?: string;
  name: string;
  response: JsonObject;
}

/** One generation request (SPEC §7.2). Use cases name a task, never a model. */
export interface LlmRequest {
  task: LlmTask;
  /** The prompt builder's `PROMPT_VERSION`, for example `screening@1`; stored with every call. */
  promptVersion: string;
  /** System instruction. Keep it byte-stable across calls so implicit caching can hit (SPEC §9.2). */
  system: string;
  contents: readonly LlmTurn[];
  tools?: readonly LlmToolDeclaration[];
  /** JSON Schema the reply must follow. The reply is still re-validated with Zod. */
  responseSchema?: JsonObject;
  /** Upper bound on output tokens, including Gemini 3 thinking tokens, so leave headroom. */
  maxOutputTokens: number;
  /** Leave unset: Google recommends the default (1.0) for Gemini 3, and lower values can loop. */
  temperature?: number;
  /** Signals for the routing policy, for example the question for `ask.answer`. Not sent to the model. */
  routingContext?: RoutingContext;
  /** The HTTP request behind the call, for `llm_calls.request_id`. Absent for CLI runs. */
  requestId?: string;
}

/** Token counts for one call, as the provider reported them. */
export interface LlmUsage {
  inputTokens: number;
  /** Visible output plus thinking tokens: both are billed as output and count toward the limit. */
  outputTokens: number;
  /** Input tokens served from the implicit cache (`cachedContentTokenCount`). */
  cachedTokens: number;
}

/** Why the model stopped. `max_tokens` usually means truncated JSON. */
export type LlmFinishReason = 'stop' | 'max_tokens' | 'safety' | 'other';

/** One model turn (SPEC §7.2). */
export interface LlmResponse {
  /** The provider turn, to append unchanged to the next request. */
  content: ModelContent;
  /** The concatenated text parts; empty when the model only called functions. */
  text: string;
  functionCalls: readonly LlmFunctionCall[];
  usage: LlmUsage;
  /** The model that actually answered, after routing and any fallback. */
  model: string;
  latencyMs: number;
  finishReason: LlmFinishReason;
}

/**
 * Generates model turns. Use cases depend on this port; the routing decorator picks the model
 * from `task` (SPEC §7.3, ADR 0010).
 */
export interface LlmClient {
  /**
   * Generates one model turn.
   *
   * @throws LlmUnavailableError when every attempt and the fallback tier failed transiently.
   * @throws LlmCallError (reason `rejected`) when the provider refused the request, which is a bug.
   * @throws FixtureMissingError in replay mode when no recording matches the request.
   */
  generate(request: LlmRequest): Promise<LlmResponse>;
}
