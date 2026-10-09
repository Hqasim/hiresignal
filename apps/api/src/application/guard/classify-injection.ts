import type { ClassifierVerdict } from '../../domain/guard/guard-verdict';
import type { RedactedText } from '../../domain/redaction/redacted-text';
import { capText } from '../llm/cap-text';
import { generateStructured } from '../llm/generate-structured';
import type { LlmClient } from '../ports/llm-client';
import {
  buildInjectionClassifierPrompt,
  CLASSIFIER_RATIONALE_MAX_CHARS,
  ClassifierReplySchema,
  PROMPT_VERSION,
} from '../prompts/injection-classifier';

/** Dependencies of {@link createClassifyInjection}. */
export interface ClassifyInjectionDeps {
  llm: LlmClient;
  /** `CLASSIFIER_MAX_OUTPUT_TOKENS`. */
  maxOutputTokens: number;
}

/** Classifies one redacted resume. */
export type ClassifyInjection = (resume: RedactedText) => Promise<ClassifierVerdict>;

/**
 * Layer L3 of the injection guard (SPEC §9.4): asks the model (task `guard.classify`, routed to
 * Flash-Lite) whether a redacted resume tries to manipulate the AI screener, and returns its
 * schema-validated verdict. It catches paraphrased social engineering the L2 rules miss (C07).
 *
 * The resume is spotlighted as untrusted data, and the rationale is capped at
 * `CLASSIFIER_RATIONALE_MAX_CHARS` so a verbose reply can't bloat `guard_verdict`. Run it only
 * when `shouldRunClassifier` says so: a resume with a high-severity signal is already quarantined
 * and never reaches the model.
 *
 * @throws LlmOutputInvalidError if the reply doesn't match the schema after one repair.
 * @throws LlmUnavailableError, LlmCallError or FixtureMissingError from the client.
 *
 * @example
 * const classify = createClassifyInjection({ llm, maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS });
 * const verdict = await classify(redacted.text); // { verdict: 'benign', confidence: 0.93, rationale: '…' }
 */
export function createClassifyInjection(deps: ClassifyInjectionDeps): ClassifyInjection {
  return async (resume) => {
    const { value } = await generateStructured(deps.llm, {
      task: 'guard.classify',
      promptVersion: PROMPT_VERSION,
      ...buildInjectionClassifierPrompt(resume),
      maxOutputTokens: deps.maxOutputTokens,
      schema: ClassifierReplySchema,
    });
    return { ...value, rationale: capText(value.rationale, CLASSIFIER_RATIONALE_MAX_CHARS) };
  };
}
