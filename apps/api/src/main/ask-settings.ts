import type { AskSettings } from '../application/ask/ask-talent-pool';
import {
  ASK_KEYWORD_MATCH,
  ASK_MAX_OUTPUT_TOKENS,
  ASK_TOP_K,
  RETRIEVAL_POOL_PER_ARM,
  RRF_K,
  SIMILARITY_FLOOR,
} from '../config/ai';

/**
 * The ask tunables from `config/ai.ts`, in the shape the use case takes. The API and the golden
 * question CLI share it, so a question asked through the route sends the same request, and
 * replays the same fixture, as the one the CLI recorded.
 */
export const ASK_SETTINGS: AskSettings = {
  topK: ASK_TOP_K,
  poolPerArm: RETRIEVAL_POOL_PER_ARM,
  rrfK: RRF_K,
  keywordMatch: ASK_KEYWORD_MATCH,
  similarityFloor: SIMILARITY_FLOOR,
  maxOutputTokens: ASK_MAX_OUTPUT_TOKENS,
};
