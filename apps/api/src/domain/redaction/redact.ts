import type { TextSpan } from '../shared/text-span';
import {
  detectAddresses,
  detectEmails,
  detectGraduationYears,
  detectPerson,
  detectPhones,
  detectSchools,
  detectUrls,
  type PiiMatch,
} from './detectors';
import { findEducationSection } from './education-section';
import type { RedactedText } from './redacted-text';
import { type PiiType, PiiTypeSchema, type RedactionSummary } from './redaction-summary';

/** What {@link redact} needs besides the text. */
export interface RedactOptions {
  /** The `# Full Name` heading (`extractHeaderName`); `null` when the resume has none. */
  personName: string | null;
}

/** Redacted text plus how many distinct entities of each type were replaced. */
export interface RedactionResult {
  text: RedactedText;
  summary: RedactionSummary;
}

/**
 * When two matches start at the same place and are equally long, the more specific type wins.
 * Longer matches already win first, so `priya.raman@example.com` stays one EMAIL rather than a
 * PERSON followed by leftovers.
 */
const PRIORITY: Record<PiiType, number> = {
  EMAIL: 0,
  URL: 1,
  PHONE: 2,
  ADDRESS: 3,
  SCHOOL: 4,
  GRAD_YEAR: 5,
  PERSON: 6,
};

/**
 * Replaces PII in normalized resume text with tokens such as `[EMAIL_1]` (SPEC §9.3, ADR 0014).
 * This is the only function that produces {@link RedactedText} from raw text.
 *
 * - Tokens are numbered per type in order of first appearance, and the same value always gets
 *   the same token. All variants of the header name share `[PERSON_1]`.
 * - Schools and graduation years are redacted only in the Education section.
 * - Overlapping matches resolve to the one that starts first, then the longest, then by type.
 * - It is one-way: the originals aren't returned, so they can't be stored.
 *
 * @example
 * redact('# Priya Raman\npriya@example.com', { personName: 'Priya Raman' });
 * // { text: '# [PERSON_1]\n[EMAIL_1]', summary: [{ type: 'PERSON', count: 1 }, { type: 'EMAIL', count: 1 }] }
 */
export function redact(text: string, options: RedactOptions): RedactionResult {
  const matches = resolveOverlaps(detectAll(text, options));
  const tokens = new Map<string, string>();
  const counts = new Map<PiiType, number>();
  let output = '';
  let cursor = 0;
  for (const match of matches) {
    output += text.slice(cursor, match.start) + tokenFor(match, tokens, counts);
    cursor = match.end;
  }
  output += text.slice(cursor);

  return {
    // The one place raw text becomes RedactedText; see the TSDoc above and ADR 0014.
    text: output as RedactedText,
    summary: PiiTypeSchema.options.flatMap((type) => {
      const count = counts.get(type) ?? 0;
      return count > 0 ? [{ type, count }] : [];
    }),
  };
}

function detectAll(text: string, { personName }: RedactOptions): PiiMatch[] {
  const education = findEducationSection(text);
  return [
    ...detectEmails(text),
    ...detectUrls(text),
    ...detectPhones(text),
    ...detectAddresses(text),
    ...(education === null ? [] : detectInSection(text, education)),
    ...(personName === null ? [] : detectPerson(text, personName)),
  ];
}

function detectInSection(text: string, section: TextSpan): PiiMatch[] {
  const slice = text.slice(section.start, section.end);
  return [...detectSchools(slice), ...detectGraduationYears(slice)].map((match) => ({
    ...match,
    start: match.start + section.start,
    end: match.end + section.start,
  }));
}

function resolveOverlaps(matches: readonly PiiMatch[]): PiiMatch[] {
  const ordered = [...matches].sort(
    (a, b) => a.start - b.start || b.end - a.end || PRIORITY[a.type] - PRIORITY[b.type],
  );
  const kept: PiiMatch[] = [];
  let lastEnd = 0;
  for (const match of ordered) {
    if (match.start >= lastEnd && match.end > match.start) {
      kept.push(match);
      lastEnd = match.end;
    }
  }
  return kept;
}

function tokenFor(
  match: PiiMatch,
  tokens: Map<string, string>,
  counts: Map<PiiType, number>,
): string {
  const id = `${match.type}:${match.key}`;
  const existing = tokens.get(id);
  if (existing !== undefined) {
    return existing;
  }
  const count = (counts.get(match.type) ?? 0) + 1;
  counts.set(match.type, count);
  const token = `[${match.type}_${String(count)}]`;
  tokens.set(id, token);
  return token;
}
