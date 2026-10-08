import { FixtureMissingError } from '../../../application/errors/fixture-missing-error';
import { toModelContent } from '../../../application/llm/model-content';
import type { LlmResponse } from '../../../application/ports/llm-client';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../../application/ports/routed-llm-client';
import { fixtureKey, generationKeyPayload } from './fixture-key';
import { GenerationFixtureSchema } from './fixture-schemas';
import type { FixtureStore } from './fixture-store';

/**
 * `LLM_MODE=replay` (SPEC §9.8): answers from recorded fixtures and never touches the network.
 * Tests, CI and production seeding use it, so they are deterministic and free.
 *
 * The recorded latency and token usage are returned as recorded, so traces and cache-ratio
 * metrics look like the live run they came from.
 *
 * @throws FixtureMissingError when nothing was recorded for this exact request and model.
 *
 * @example
 * const replay = createReplayLlmClient(createFsFixtureStore(FIXTURES_DIRECTORY));
 */
export function createReplayLlmClient(store: FixtureStore): RoutedLlmClient {
  return {
    async generate(request: RoutedLlmRequest): Promise<LlmResponse> {
      const key = fixtureKey('generate', request.route.model, generationKeyPayload(request));
      const raw = await store.read(request.task, key);
      if (raw === null) {
        throw new FixtureMissingError(request.task);
      }
      const { model, response, usage } = GenerationFixtureSchema.parse(raw);
      return {
        content: toModelContent(response.content),
        text: response.text,
        functionCalls: response.functionCalls.map(({ id, name, args }) => ({
          ...(id !== undefined && { id }),
          name,
          args,
        })),
        usage,
        model,
        latencyMs: response.latencyMs,
        finishReason: response.finishReason,
      };
    },
  };
}
