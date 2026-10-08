import { JsonValueSchema } from '../../../application/llm/json-value';
import type { Clock } from '../../../application/ports/clock';
import type { LlmResponse } from '../../../application/ports/llm-client';
import type { Logger } from '../../../application/ports/logger';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../../application/ports/routed-llm-client';
import { fixtureKey, generationKeyPayload } from './fixture-key';
import type { GenerationFixture } from './fixture-schemas';
import type { FixtureStore } from './fixture-store';

/** Dependencies of {@link createRecordingLlmClient}. */
export interface RecordingDeps {
  store: FixtureStore;
  clock: Clock;
  /** Logs `llm.fixture_recorded` with the task and key, never the content. */
  logger: Logger;
}

/**
 * `LLM_MODE=record` (SPEC §9.8): calls the live client, saves each successful response as a
 * fixture, and returns it unchanged. Failures aren't recorded, so replay can never reproduce a
 * transient error.
 *
 * @example
 * const recorded = createRecordingLlmClient(gemini, { store, clock, logger });
 */
export function createRecordingLlmClient(
  live: RoutedLlmClient,
  deps: RecordingDeps,
): RoutedLlmClient {
  return {
    async generate(request: RoutedLlmRequest): Promise<LlmResponse> {
      const response = await live.generate(request);
      const key = fixtureKey('generate', request.route.model, generationKeyPayload(request));
      const fixture: GenerationFixture = {
        kind: 'generate',
        key,
        task: request.task,
        model: request.route.model,
        recordedAt: deps.clock.now().toISOString(),
        response: {
          content: response.content.raw,
          text: response.text,
          functionCalls: [...response.functionCalls],
          finishReason: response.finishReason,
          latencyMs: response.latencyMs,
        },
        usage: response.usage,
      };
      // Proves the fixture is plain JSON (no undefined values) before it is written.
      await deps.store.write(request.task, key, JsonValueSchema.parse(fixture));
      deps.logger.info('llm.fixture_recorded', { task: request.task, key });
      return response;
    },
  };
}
