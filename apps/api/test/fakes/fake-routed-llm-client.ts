import type { LlmResponse } from '../../src/application/ports/llm-client';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../src/application/ports/routed-llm-client';
import type { ScriptedTurn } from './fake-llm-client';

/**
 * {@link RoutedLlmClient} fake for decorator tests: replays a script in order and records every
 * routed request, so a test can see each attempt's tier, model and fallback flag.
 */
export class FakeRoutedLlmClient implements RoutedLlmClient {
  readonly requests: RoutedLlmRequest[] = [];
  private readonly script: ScriptedTurn[];

  constructor(script: readonly ScriptedTurn[]) {
    this.script = [...script];
  }

  generate(request: RoutedLlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    const next = this.script.shift();
    if (next === undefined) {
      return Promise.reject(
        new Error(`FakeRoutedLlmClient: no scripted turn left for ${request.task}`),
      );
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }
}
