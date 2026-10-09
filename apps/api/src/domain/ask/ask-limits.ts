// Size limits of ask (SPEC §9.7). They bound what a visitor can send and what the model may write,
// so a question can't flood the prompt (LLM10) and an answer stays a readable paragraph.

/** Longest question accepted, after trimming. The contracts schema enforces the same limit at the HTTP edge. */
export const QUESTION_MAX_CHARS = 500;

/** Longest answer kept; a longer reply is cut (ending in `…`) rather than sent back for repair. */
export const ANSWER_MAX_CHARS = 1200;

/**
 * Most citations an answer may carry: enough for a sentence or two about each of several
 * candidates, few enough to check by eye. The response schema's `maxItems`.
 */
export const MAX_ANSWER_CITATIONS = 8;
