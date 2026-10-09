import { toModelContent } from '../../src/application/llm/model-content';
import type {
  LlmClient,
  LlmRequest,
  LlmResponse,
  LlmResult,
} from '../../src/application/ports/llm-client';
import type { RoutingReason } from '../../src/domain/routing/policy';

/** A scripted step: a response to return, or an error to throw. */
export type ScriptedTurn = LlmResponse | Error;

/**
 * {@link LlmClient} fake that replays a script in order and records every request, so tests can
 * assert what a use case sent. Running out of script fails the test loudly. Every result reports
 * `routedReason` (default `'default'`), as `withRouting` would.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = [];
  private readonly script: ScriptedTurn[];

  constructor(
    script: readonly ScriptedTurn[],
    private readonly routedReason: RoutingReason = 'default',
  ) {
    this.script = [...script];
  }

  generate(request: LlmRequest): Promise<LlmResult> {
    this.requests.push(request);
    const next = this.script.shift();
    if (next === undefined) {
      return Promise.reject(new Error(`FakeLlmClient: no scripted turn left for ${request.task}`));
    }
    return next instanceof Error
      ? Promise.reject(next)
      : Promise.resolve({ ...next, routedReason: this.routedReason });
  }
}

/**
 * Builds an {@link LlmResponse} whose text is `text`, with plausible defaults for the rest.
 *
 * @example
 * fakeLlmResponse('{"label":"positive"}', { model: 'flash-model' });
 */
export function fakeLlmResponse(text: string, overrides: Partial<LlmResponse> = {}): LlmResponse {
  return {
    content: toModelContent({ role: 'model', parts: [{ text }] }),
    text,
    functionCalls: [],
    usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 0 },
    model: 'lite-model',
    latencyMs: 50,
    finishReason: 'stop',
    ...overrides,
  };
}
