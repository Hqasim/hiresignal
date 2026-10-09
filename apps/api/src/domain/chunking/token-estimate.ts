/**
 * Characters per token for English prose and code, the usual rule of thumb for Gemini and other
 * BPE tokenizers. Chunking only needs an estimate: the limit it enforces is far below the
 * embedder's input limit, so being off by a few tokens never matters.
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Estimates how many tokens `text` uses, without calling a tokenizer (SPEC §9.5).
 *
 * @example
 * estimateTokens('Twelve chars'); // 3
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
