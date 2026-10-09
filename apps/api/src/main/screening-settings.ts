import type { ScreeningSettings } from '../application/screening/screen-candidate';
import {
  AGENT_MAX_OUTPUT_TOKENS,
  AGENT_SEARCH_TOP_K,
  MAX_AGENT_STEPS,
  RETRIEVAL_POOL_PER_ARM,
  RRF_K,
  SEARCH_QUERY_MAX_CHARS,
  SYNTHESIS_MAX_OUTPUT_TOKENS,
} from '../config/ai';

/**
 * The screening tunables from `config/ai.ts`, in the shape the use case takes. The seed CLI and
 * the API share it, so a live re-screen sends the same prefix and limits as the precomputed one.
 */
export const SCREENING_SETTINGS: ScreeningSettings = {
  maxAgentSteps: MAX_AGENT_STEPS,
  agentMaxOutputTokens: AGENT_MAX_OUTPUT_TOKENS,
  synthesisMaxOutputTokens: SYNTHESIS_MAX_OUTPUT_TOKENS,
  retrieval: {
    searchTopK: AGENT_SEARCH_TOP_K,
    poolPerArm: RETRIEVAL_POOL_PER_ARM,
    rrfK: RRF_K,
    maxQueryChars: SEARCH_QUERY_MAX_CHARS,
  },
};
