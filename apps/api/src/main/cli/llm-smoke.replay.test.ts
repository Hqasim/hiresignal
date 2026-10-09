import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../test/fakes/fake-clock';
import { RecordingLogger } from '../../../test/fakes/recording-logger';
import { createProviderClients, createSmokeCheck } from '../llm-wiring';

/**
 * The model IDs the committed fixtures were recorded with. Reading them from `.env.example`
 * enforces SPEC §9.8: the documented defaults must match the fixtures, or this test misses.
 */
function modelsFromEnvExample() {
  const example = parseEnv(
    readFileSync(new URL('../../../../../.env.example', import.meta.url), 'utf8'),
  );
  const lite = example.GEMINI_MODEL_LITE;
  const flash = example.GEMINI_MODEL_FLASH;
  const embeddingModel = example.GEMINI_EMBEDDING_MODEL;
  if (lite === undefined || flash === undefined || embeddingModel === undefined) {
    throw new Error(
      '.env.example must set GEMINI_MODEL_LITE, GEMINI_MODEL_FLASH and GEMINI_EMBEDDING_MODEL',
    );
  }
  return { models: { lite, flash }, embeddingModel };
}

describe('npm run llm:smoke fixtures', () => {
  it('replay offline through the same wiring the live smoke check used', async () => {
    const { models, embeddingModel } = modelsFromEnvExample();
    const provider = createProviderClients(
      { mode: 'replay', apiKey: undefined, models, embeddingModel },
      { clock: new FakeClock(), logger: new RecordingLogger() },
    );

    const report = await createSmokeCheck(provider, models)();

    expect(
      report.generations.map(({ tier, model, attempts }) => ({ tier, model, attempts })),
    ).toEqual([
      { tier: 'lite', model: models.lite, attempts: 1 },
      { tier: 'flash', model: models.flash, attempts: 1 },
    ]);
    for (const generation of report.generations) {
      expect(generation.inputTokens).toBeGreaterThan(0);
      expect(generation.outputTokens).toBeGreaterThan(0);
    }
    expect(report.embedding).toEqual({ dimensions: 768 });
  });

  it('return a unit-length query embedding', async () => {
    const { models, embeddingModel } = modelsFromEnvExample();
    const { embedder } = createProviderClients(
      { mode: 'replay', apiKey: undefined, models, embeddingModel },
      { clock: new FakeClock(), logger: new RecordingLogger() },
    );

    const vector = await embedder.embedQuery('Which candidates have run Postgres in production?');

    expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
  });
});
