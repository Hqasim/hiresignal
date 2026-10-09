import type { TextSpan } from '../shared/text-span';

const WHITESPACE_RUN = /\s+/g;

/**
 * Collapses every run of whitespace to one space and trims the ends. Quotes are compared in this
 * form, because a model reproduces words faithfully but not line breaks or double spaces.
 *
 * @example
 * normalizeWhitespace('  Led a\n  team  '); // 'Led a team'
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(WHITESPACE_RUN, ' ').trim();
}

/**
 * Finds a quote in `content` the way SPEC §9.6 verifies it: the whitespace-normalized quote must
 * be a substring of the whitespace-normalized content. Everything else is exact: case,
 * punctuation and redaction tokens.
 *
 * Returns the span of the match in the original `content`, so `content.slice(start, end)` is the
 * text as the resume shows it, and the UI can highlight it. Returns `null` when the quote is
 * absent or blank. The first occurrence wins.
 *
 * @example
 * locateQuote('Built a RAG\n  pipeline on pgvector.', 'RAG pipeline'); // { start: 8, end: 23 }
 */
export function locateQuote(content: string, quote: string): TextSpan | null {
  const needle = normalizeWhitespace(quote);
  if (needle === '') {
    return null;
  }
  const { text, origins } = collapseWithOrigins(content);
  const at = text.indexOf(needle);
  if (at === -1) {
    return null;
  }
  const start = origins[at];
  const last = origins[at + needle.length - 1];
  // The needle is non-empty and found, so both indexes are inside `origins`.
  if (start === undefined || last === undefined) {
    return null;
  }
  return { start, end: last + 1 };
}

/**
 * Collapses whitespace runs to one space (without trimming, so offsets stay simple) and records,
 * for every character of the result, its index in the original text. A collapsed space maps to
 * the first character of its run; a match never starts or ends on one, because the needle is
 * trimmed.
 */
function collapseWithOrigins(content: string): { text: string; origins: number[] } {
  let text = '';
  const origins: number[] = [];
  let inWhitespace = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content.charAt(index);
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        text += ' ';
        origins.push(index);
      }
      inWhitespace = true;
    } else {
      text += char;
      origins.push(index);
      inWhitespace = false;
    }
  }
  return { text, origins };
}
