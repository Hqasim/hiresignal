import type { GuardSignal, SignalSeverity } from './guard-verdict';

/** The result of the L0 scan: what was found, and the text with those characters removed. */
export interface InvisibleScan {
  /** At most one signal per category, in the order zero-width, bidi, tag. */
  signals: GuardSignal[];
  /** The raw text without the flagged characters (and without a leading byte-order mark). */
  stripped: string;
}

interface Category {
  id: string;
  label: string;
  severity: SignalSeverity;
  matches: (codePoint: number) => boolean;
  /** Tag characters are summarized as one range, so the excerpt doesn't hint at the payload. */
  summarizeAsRange: string | null;
}

const BYTE_ORDER_MARK = 0xfeff;
const ZERO_WIDTH_JOINER = 0x200d;

/**
 * SPEC §9.4 layer L0. Tag characters are high severity because they have no legitimate use in a
 * resume and are the standard way to smuggle hidden ASCII to a model. The others also appear
 * accidentally (copy-paste from web pages), so they are medium and the classifier gets a say.
 */
const CATEGORIES: readonly Category[] = [
  {
    id: 'L0.zero-width',
    label: 'Zero-width characters',
    severity: 'medium',
    matches: (cp) => (cp >= 0x200b && cp <= 0x200d) || cp === 0x2060 || cp === BYTE_ORDER_MARK,
    summarizeAsRange: null,
  },
  {
    id: 'L0.bidi-control',
    label: 'Bidirectional control characters',
    severity: 'medium',
    matches: (cp) => (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069),
    summarizeAsRange: null,
  },
  {
    id: 'L0.tag-characters',
    label: 'Unicode tag characters (hidden ASCII)',
    severity: 'high',
    matches: (cp) => cp >= 0xe0000 && cp <= 0xe007f,
    summarizeAsRange: 'U+E0000–U+E007F',
  },
];

/** Emoji, which a zero-width joiner may legitimately combine (U+1F469 U+200D U+1F4BB). */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
/** U+FE0F (emoji presentation) and the skin-tone modifiers, which may sit between an emoji and a joiner. */
const EMOJI_MODIFIERS = { presentation: 0xfe0f, skinToneFirst: 0x1f3fb, skinToneLast: 0x1f3ff };

/**
 * Layer L0 of the injection guard (SPEC §9.4): finds zero-width characters, bidi controls and
 * Unicode tag characters in **raw** text, records them, and strips them before normalization and
 * redaction.
 *
 * Signals have `span: null` because their offsets are in the raw text, not the redacted text the UI
 * shows, and the excerpt names code points and counts only: raw text isn't redacted yet, and a
 * decoded tag payload could carry PII.
 *
 * Two benign uses are left alone: a byte-order mark at the very start (silently removed), and a
 * zero-width joiner between two emoji, as in the technologist emoji (kept).
 *
 * @example
 * scanInvisible('Senior\u{200b} engineer');
 * // { signals: [{ id: 'L0.zero-width', severity: 'medium', excerpt: 'U+200B ×1', … }], stripped: 'Senior engineer' }
 */
export function scanInvisible(raw: string): InvisibleScan {
  const chars = Array.from(raw);
  const found = CATEGORIES.map(() => new Map<number, number>());
  let stripped = '';
  chars.forEach((char, index) => {
    const codePoint = char.codePointAt(0) ?? 0;
    const categoryIndex = CATEGORIES.findIndex((category) => category.matches(codePoint));
    if (categoryIndex === -1 || isEmojiJoiner(chars, index, codePoint)) {
      stripped += char;
      return;
    }
    if (index === 0 && codePoint === BYTE_ORDER_MARK) {
      return;
    }
    const counts = found[categoryIndex];
    counts?.set(codePoint, (counts.get(codePoint) ?? 0) + 1);
  });

  const signals = CATEGORIES.flatMap((category, index) => {
    const counts = found[index];
    return counts === undefined || counts.size === 0 ? [] : [toSignal(category, counts)];
  });
  return { signals, stripped };
}

function isEmojiJoiner(chars: readonly string[], index: number, codePoint: number): boolean {
  if (codePoint !== ZERO_WIDTH_JOINER) {
    return false;
  }
  let before = index - 1;
  while (before >= 0 && isEmojiModifier(chars[before]?.codePointAt(0))) {
    before -= 1;
  }
  return PICTOGRAPHIC.test(chars[before] ?? '') && PICTOGRAPHIC.test(chars[index + 1] ?? '');
}

function isEmojiModifier(codePoint: number | undefined): boolean {
  return (
    codePoint === EMOJI_MODIFIERS.presentation ||
    (codePoint !== undefined &&
      codePoint >= EMOJI_MODIFIERS.skinToneFirst &&
      codePoint <= EMOJI_MODIFIERS.skinToneLast)
  );
}

function toSignal(category: Category, counts: ReadonlyMap<number, number>): GuardSignal {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const excerpt =
    category.summarizeAsRange === null
      ? [...counts.entries()]
          .sort(([a], [b]) => a - b)
          .map(([codePoint, count]) => `${formatCodePoint(codePoint)} ×${String(count)}`)
          .join(', ')
      : `${category.summarizeAsRange} ×${String(total)}`;
  return {
    id: category.id,
    layer: 'L0',
    severity: category.severity,
    label: category.label,
    span: null,
    excerpt,
  };
}

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}
