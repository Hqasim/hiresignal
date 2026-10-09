import type { Embedder } from '../../../application/ports/embedder';
import type { LlmResponse } from '../../../application/ports/llm-client';
import type {
  RoutedLlmClient,
  RoutedLlmRequest,
} from '../../../application/ports/routed-llm-client';
import type { RedactedText } from '../../../domain/redaction/redacted-text';
import type { EmbeddingTask } from '../../../domain/routing/llm-task';
import type { UnitVector } from '../../../domain/vectors/unit-vector';
import { embeddingKeyPayload, fixtureKey, generationKeyPayload } from './fixture-key';
import type { FixtureStore } from './fixture-store';
import type { EmbeddingFixtureIdentity } from './replay-embedder';

/** The two chains a fixture-first split chooses between. Each is already call-logged. */
export interface FixtureFirstChains<T> {
  /** Answers from the fixture store; logged as `replay`. */
  replay: T;
  /** Calls Gemini and records the response; logged as `live`, and throttled when seeding. */
  record: T;
}

/**
 * `LLM_MODE=record` for generations (SPEC §9.8, ADR 0009): a request whose fixture is already
 * stored replays it, and only a request without one reaches Gemini and is recorded. So a recording
 * run spends free-tier quota only on new prompts, and an unchanged prompt keeps its committed
 * answer instead of being re-rolled. To force a fresh recording, delete that task's fixtures.
 *
 * Both chains carry their own call logging, so `llm_calls` and the seed tally show which calls
 * really went to Gemini.
 *
 * @example
 * const llm = withFixtureFirst({ replay: loggedReplay, record: loggedRecorder }, store);
 */
export function withFixtureFirst(
  chains: FixtureFirstChains<RoutedLlmClient>,
  store: FixtureStore,
): RoutedLlmClient {
  return {
    async generate(request: RoutedLlmRequest): Promise<LlmResponse> {
      const key = fixtureKey('generate', request.route.model, generationKeyPayload(request));
      const recorded = (await store.read(request.task, key)) !== null;
      return (recorded ? chains.replay : chains.record).generate(request);
    },
  };
}

/**
 * {@link withFixtureFirst} for the {@link Embedder}: replays a stored batch, records a new one.
 * The key covers the whole batch, exactly as the recorder writes it.
 *
 * @example
 * const embedder = withEmbeddingFixtureFirst({ replay, record }, { store, model, inputFormat });
 */
export function withEmbeddingFixtureFirst(
  chains: FixtureFirstChains<Embedder>,
  identity: EmbeddingFixtureIdentity,
): Embedder {
  async function pick(task: EmbeddingTask, texts: readonly string[]): Promise<Embedder> {
    const key = fixtureKey(
      'embed',
      identity.model,
      embeddingKeyPayload(task, identity.inputFormat, texts),
    );
    return (await identity.store.read(task, key)) !== null ? chains.replay : chains.record;
  }

  return {
    async embedDocuments(texts: readonly RedactedText[]): Promise<UnitVector[]> {
      return (await pick('embed.documents', texts)).embedDocuments(texts);
    },
    async embedQuery(text: string): Promise<UnitVector> {
      return (await pick('embed.query', [text])).embedQuery(text);
    },
  };
}
