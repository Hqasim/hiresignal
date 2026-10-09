/** The first `# Heading` line (exactly one `#`), with surrounding spaces trimmed. */
const HEADER = /^#(?!#)[ \t]+(\S[^\n]*?)[ \t]*$/m;

/**
 * Reads the candidate's name from the resume's `# Full Name` heading (SPEC §12), the name the
 * redactor's PERSON detector looks for. Returns `null` when there's no such heading, in which case
 * names can't be redacted (a known limit, `docs/threat-model.md`).
 *
 * @example
 * extractHeaderName('# Priya Raman\n## Summary'); // 'Priya Raman'
 */
export function extractHeaderName(text: string): string | null {
  return HEADER.exec(text)?.[1] ?? null;
}
