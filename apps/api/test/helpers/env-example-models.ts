import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * The model IDs the committed fixtures were recorded with. Reading them from `.env.example`
 * enforces SPEC §9.8: the documented defaults must match the fixtures, or replay misses.
 */
export function modelsFromEnvExample() {
  const example = parseEnv(
    readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8'),
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
