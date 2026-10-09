/**
 * Trims model-written text and cuts it to `maxChars`, ending a cut with `…`. Gemini doesn't
 * document `maxLength` for structured output, so length limits on free text are applied in code
 * rather than by a repair call (SPEC §21 risk 4).
 *
 * @example
 * capText('  A long rationale…  ', 10); // 'A long ra…'
 */
export function capText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars - 1)}…`;
}
