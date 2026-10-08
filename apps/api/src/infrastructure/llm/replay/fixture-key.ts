import { createHash } from 'node:crypto';

import { type JsonValue, JsonValueSchema } from '../../../application/llm/json-value';
import type { RoutedLlmRequest } from '../../../application/ports/routed-llm-client';
import type { EmbeddingTask } from '../../../domain/routing/llm-task';
import { canonicalJson } from './canonical-json';

/** What kind of provider call a fixture records. */
export type FixtureKind = 'generate' | 'embed';

/**
 * The fixture key: `sha256(canonicalJson({ kind, model, request }))` in hex (SPEC §9.8). Any
 * change to a prompt, schema, tool, token limit or model ID changes the key, so a stale fixture
 * can't be replayed by accident.
 *
 * @example
 * fixtureKey('generate', 'gemini-lite', generationKeyPayload(request)); // '3f2a…' (64 hex chars)
 */
export function fixtureKey(kind: FixtureKind, model: string, request: JsonValue): string {
  return createHash('sha256').update(canonicalJson({ kind, model, request })).digest('hex');
}

/**
 * The parts of a generation request that decide the model's answer. Excluded on purpose:
 *
 * - `route.tier`, `route.reason` and `route.isFallback`: the model ID is in the key already, and
 *   a fallback call to that model should replay the same fixture as a direct one.
 * - `routingContext`: it steers routing, and isn't sent to the model.
 * - `requestId`: it differs on every HTTP request.
 */
export function generationKeyPayload(request: RoutedLlmRequest): JsonValue {
  return toJson({
    task: request.task,
    promptVersion: request.promptVersion,
    system: request.system,
    contents: request.contents,
    tools: request.tools ?? null,
    responseSchema: request.responseSchema ?? null,
    maxOutputTokens: request.maxOutputTokens,
    temperature: request.temperature ?? null,
  });
}

/**
 * The parts of an embedding call that decide the vectors. `inputFormat` stands for the adapter's
 * prefixes, which are applied inside the adapter and so aren't visible in `texts`.
 */
export function embeddingKeyPayload(
  task: EmbeddingTask,
  inputFormat: string,
  texts: readonly string[],
): JsonValue {
  return { task, inputFormat, texts: [...texts] };
}

/** JSON round trip: drops `undefined` fields and checks the result is plain JSON. */
function toJson(value: unknown): JsonValue {
  return JsonValueSchema.parse(JSON.parse(JSON.stringify(value)));
}
