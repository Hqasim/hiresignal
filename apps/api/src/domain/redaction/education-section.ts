import type { TextSpan } from '../shared/text-span';

/** A top-level `## Education` heading line. `###` role headings don't count. */
const EDUCATION_HEADING = /^##(?!#)[ \t]+Education\b[^\n]*$/im;
/** Any top-level `## ` heading, which ends the section. */
const TOP_LEVEL_HEADING = /^##(?!#)/gm;

/**
 * Finds the Education section: from its `## Education` heading up to the next `##` heading, or the
 * end of the text. School names and graduation years are redacted only inside it (SPEC §9.3),
 * because elsewhere a year is job evidence ("2019–2023") and a university can be a client.
 *
 * @example
 * findEducationSection('## Skills\nGo\n## Education\nB.S.'); // { start: 13, end: 30 }
 */
export function findEducationSection(text: string): TextSpan | null {
  const heading = EDUCATION_HEADING.exec(text);
  if (heading === null) {
    return null;
  }
  const start = heading.index;
  const next = new RegExp(TOP_LEVEL_HEADING.source, TOP_LEVEL_HEADING.flags);
  next.lastIndex = start + heading[0].length;
  const end = next.exec(text)?.index ?? text.length;
  return { start, end };
}
