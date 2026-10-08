import { LlmCallError, type LlmFailureReason } from '../../src/application/llm/llm-call-error';
import type { LlmRequest } from '../../src/application/ports/llm-client';
import type { RoutedLlmRequest } from '../../src/application/ports/routed-llm-client';

/** Model IDs used by decorator and wiring tests. */
export const TEST_MODELS = { lite: 'lite-model', flash: 'flash-model' } as const;

/** A minimal valid {@link LlmRequest}. */
export function llmRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    task: 'ask.answer',
    promptVersion: 'test@1',
    system: 'Answer from the evidence only.',
    contents: [{ role: 'user', text: 'Who has led a team?' }],
    maxOutputTokens: 512,
    ...overrides,
  };
}

/** A minimal valid {@link RoutedLlmRequest} on the lite tier. */
export function routedRequest(overrides: Partial<RoutedLlmRequest> = {}): RoutedLlmRequest {
  return {
    ...llmRequest(),
    route: { tier: 'lite', model: TEST_MODELS.lite, reason: 'default', isFallback: false },
    ...overrides,
  };
}

/** A provider failure, as an adapter would throw it. */
export function callError(reason: LlmFailureReason, retryAfterMs?: number): LlmCallError {
  return new LlmCallError(`simulated ${reason}`, {
    reason,
    task: 'ask.answer',
    ...(retryAfterMs !== undefined && { retryAfterMs }),
  });
}
