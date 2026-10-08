import type { ModelContent } from '../ports/llm-client';
import type { JsonValue } from './json-value';

/**
 * Wraps a provider turn as {@link ModelContent}. Only LLM adapters call this: the Gemini client
 * on a live response and the replay client on a recorded one. Use cases pass `content` along
 * and never construct it.
 *
 * @example
 * const content = toModelContent({ role: 'model', parts: [{ text: '{"ok":true}' }] });
 */
export function toModelContent(raw: JsonValue): ModelContent {
  // The brand marks provider-owned data; see the TSDoc above.
  return { raw } as ModelContent;
}
