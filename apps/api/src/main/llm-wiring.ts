import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import type { Clock } from '../application/ports/clock';
import type { Embedder } from '../application/ports/embedder';
import type { LlmCallRepository } from '../application/ports/llm-call-repository';
import type { LlmClient } from '../application/ports/llm-client';
import type { Logger } from '../application/ports/logger';
import type { RoutedLlmClient } from '../application/ports/routed-llm-client';
import {
  ASK_ESCALATION_CANDIDATES,
  ASK_ESCALATION_CONTEXT_TOKENS,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  LLM_MAX_RETRIES,
  LLM_RETRY_BASE_DELAY_MS,
  LLM_RETRY_MAX_DELAY_MS,
  LLM_TIMEOUT_MS,
} from '../config/ai';
import {
  withCallLogging,
  withEmbeddingCallLogging,
} from '../infrastructure/llm/decorators/with-call-logging';
import { withFallback } from '../infrastructure/llm/decorators/with-fallback';
import { withRetry } from '../infrastructure/llm/decorators/with-retry';
import { type ModelsByTier, withRouting } from '../infrastructure/llm/decorators/with-routing';
import { createGeminiClients } from '../infrastructure/llm/gemini/create-gemini-clients';
import { GEMINI_EMBEDDING_INPUT_FORMAT } from '../infrastructure/llm/gemini/gemini-embedder';
import { createFsFixtureStore } from '../infrastructure/llm/replay/fixture-store';
import { createRecordingEmbedder } from '../infrastructure/llm/replay/recording-embedder';
import { createRecordingLlmClient } from '../infrastructure/llm/replay/recording-llm-client';
import { createReplayEmbedder } from '../infrastructure/llm/replay/replay-embedder';
import { createReplayLlmClient } from '../infrastructure/llm/replay/replay-llm-client';

/**
 * `apps/api/fixtures/llm/`, where recorded responses are committed (SPEC §9.8). Only read in
 * `replay` mode and written in `record` mode; the production Lambda runs `live` and never opens it.
 */
export const FIXTURES_DIRECTORY = fileURLToPath(new URL('../../fixtures/llm/', import.meta.url));

/** Which model clients to build, from env. */
export interface LlmSettings {
  mode: 'live' | 'record' | 'replay';
  /** Required unless `mode` is `replay`; `parseEnv` enforces it. */
  apiKey: string | undefined;
  models: ModelsByTier;
  embeddingModel: string;
}

/** Shared dependencies of the LLM clients. */
export interface LlmWiringDeps {
  clock: Clock;
  logger: Logger;
}

/** The innermost generation and embedding clients for a mode, before any decorator. */
export interface ProviderClients {
  llm: RoutedLlmClient;
  embedder: Embedder;
}

/**
 * Picks the innermost clients for `LLM_MODE` (SPEC §7.3, ADR 0009): Gemini (`live`), Gemini
 * wrapped by the recorders (`record`), or fixtures only (`replay`).
 *
 * @throws Error if a live mode has no API key; `parseEnv` normally catches this first.
 */
export function createProviderClients(settings: LlmSettings, deps: LlmWiringDeps): ProviderClients {
  const store = createFsFixtureStore(FIXTURES_DIRECTORY);
  const embeddingIdentity = {
    store,
    model: settings.embeddingModel,
    inputFormat: GEMINI_EMBEDDING_INPUT_FORMAT,
  };
  if (settings.mode === 'replay') {
    return {
      llm: createReplayLlmClient(store),
      embedder: createReplayEmbedder(embeddingIdentity),
    };
  }
  if (settings.apiKey === undefined) {
    throw new Error(`GEMINI_API_KEY is required when LLM_MODE is ${settings.mode}`);
  }
  const gemini = createGeminiClients({
    apiKey: settings.apiKey,
    clock: deps.clock,
    timeoutMs: LLM_TIMEOUT_MS,
    embeddingModel: settings.embeddingModel,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    embeddingBatchSize: EMBEDDING_BATCH_SIZE,
  });
  if (settings.mode === 'live') {
    return gemini;
  }
  return {
    llm: createRecordingLlmClient(gemini.llm, { store, ...deps }),
    embedder: createRecordingEmbedder(gemini.embedder, { ...embeddingIdentity, ...deps }),
  };
}

/**
 * The full LLM stack for the API and the CLIs. The decorator order is SPEC §7.3, outermost first:
 * routing → fallback → retry → call logging → provider client. Embeddings get call logging only:
 * there is no second embedding tier to fall back to.
 *
 * @example
 * const { llm, embedder } = createLlm(settings, { clock, logger, calls });
 */
export function createLlm(
  settings: LlmSettings,
  deps: LlmWiringDeps & { calls: LlmCallRepository },
): { llm: LlmClient; embedder: Embedder } {
  const provider = createProviderClients(settings, deps);
  const logging = {
    calls: deps.calls,
    clock: deps.clock,
    logger: deps.logger,
    // Recording mode calls Gemini, so its calls count as live toward the daily cap.
    source: settings.mode === 'replay' ? 'replay' : 'live',
  } as const;

  const logged = withCallLogging(provider.llm, logging);
  const retried = withRetry(logged, {
    maxRetries: LLM_MAX_RETRIES,
    baseDelayMs: LLM_RETRY_BASE_DELAY_MS,
    maxDelayMs: LLM_RETRY_MAX_DELAY_MS,
    sleep: (ms) => sleep(ms),
    random: Math.random,
  });
  const resilient = withFallback(retried, { models: settings.models });
  const llm = withRouting(resilient, {
    models: settings.models,
    thresholds: {
      escalationContextTokens: ASK_ESCALATION_CONTEXT_TOKENS,
      escalationCandidates: ASK_ESCALATION_CANDIDATES,
    },
  });

  const embedder = withEmbeddingCallLogging(provider.embedder, {
    ...logging,
    model: settings.embeddingModel,
    inputFormat: GEMINI_EMBEDDING_INPUT_FORMAT,
  });
  return { llm, embedder };
}
