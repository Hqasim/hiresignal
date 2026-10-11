import type { LlmCallRepository, StoredLlmCall } from '../ports/llm-call-repository';

/** Lists the `limit` most recent model call attempts, newest first. */
export type ListRecentCalls = (options: { limit: number }) => Promise<StoredLlmCall[]>;

/**
 * `GET /api/ops/calls` (SPEC §10): recent call metadata for the ops page. Rows never hold
 * prompts, resume text or model output, so nothing needs filtering here.
 *
 * @example
 * const calls = await createListRecentCalls({ calls: repository })({ limit: 50 });
 */
export function createListRecentCalls(deps: { calls: LlmCallRepository }): ListRecentCalls {
  return (options) => deps.calls.recent(options.limit);
}
