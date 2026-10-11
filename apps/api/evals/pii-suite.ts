// PII suite (SPEC §14): does redaction remove every labelled entity in data/evals/pii.jsonl, and
// every word of each seeded resume's header name? The gate is zero leaks. Pure: the eval wiring
// runs `redact` and `prepareResume`; this file only counts.

import { type PiiType, PiiTypeSchema } from '../src/domain/redaction/redaction-summary';
import { ratio } from './ratio';

/** One labelled snippet after redaction: each entity's type and whether its value survived. */
export interface PiiSnippetRun {
  id: string;
  entities: readonly { type: PiiType; leaked: boolean }[];
}

/** One seeded resume after redaction: how many words its header name has, and how many survived. */
export interface PiiResumeRun {
  alias: string;
  nameWords: number;
  leakedNameWords: number;
}

/** Recall of one PII type over the labelled snippets. */
export interface PiiTypeRecall {
  type: PiiType;
  labelled: number;
  redacted: number;
  recall: number | null;
}

/** The PII suite's result. */
export interface PiiSummary {
  snippets: number;
  entities: number;
  /** Labelled values still present after redaction. */
  entityLeaks: number;
  leakedSnippets: string[];
  resumes: number;
  /** Header-name words still present in a redacted resume. */
  nameLeaks: number;
  leakedResumes: string[];
  /** `entityLeaks + nameLeaks`: the gated number, which must be 0. */
  leaks: number;
  /** Per labelled type, in {@link PiiTypeSchema} order. */
  byType: PiiTypeRecall[];
}

/**
 * Splits a header name into the words the name check looks for.
 *
 * @example
 * nameWords("Liam O'Connor"); // ['Liam', "O'Connor"]
 */
export function nameWords(name: string | null): string[] {
  return (name ?? '').split(/\s+/).filter((word) => word !== '');
}

/**
 * Counts the words of `name` that still appear, as whole words and ignoring case, in `redacted`.
 * Whole words, so "Lin" doesn't match "pipeline" (the same check as the resume dataset test).
 *
 * @example
 * leakedNameWords('[PERSON_1] led it; Chen reviewed it.', 'Mei Lin Chen'); // 1
 */
export function leakedNameWords(redacted: string, name: string | null): number {
  return nameWords(name).filter((word) => wholeWord(word).test(redacted)).length;
}

function wholeWord(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(String.raw`(?<!\p{L})${escaped}(?!\p{L})`, 'iu');
}

/**
 * Totals the leaks and the per-type recall.
 *
 * @example
 * summarizePii(snippets, resumes).leaks; // 0
 */
export function summarizePii(
  snippets: readonly PiiSnippetRun[],
  resumes: readonly PiiResumeRun[],
): PiiSummary {
  const entities = snippets.flatMap((snippet) => snippet.entities);
  const entityLeaks = entities.filter((entity) => entity.leaked).length;
  const nameLeaks = resumes.reduce((sum, resume) => sum + resume.leakedNameWords, 0);
  return {
    snippets: snippets.length,
    entities: entities.length,
    entityLeaks,
    leakedSnippets: snippets
      .filter((snippet) => snippet.entities.some((entity) => entity.leaked))
      .map((snippet) => snippet.id),
    resumes: resumes.length,
    nameLeaks,
    leakedResumes: resumes
      .filter((resume) => resume.leakedNameWords > 0)
      .map((resume) => resume.alias),
    leaks: entityLeaks + nameLeaks,
    byType: PiiTypeSchema.options.flatMap((type) => {
      const ofType = entities.filter((entity) => entity.type === type);
      if (ofType.length === 0) {
        return [];
      }
      const redacted = ofType.filter((entity) => !entity.leaked).length;
      return [{ type, labelled: ofType.length, redacted, recall: ratio(redacted, ofType.length) }];
    }),
  };
}
