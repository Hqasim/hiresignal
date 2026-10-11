import type { GuardSignal, RedactionCount, TextSpan } from '@hiresignal/contracts';

/** A kind of PII that redaction replaced, as it appears in a token like `[EMAIL_1]`. */
export type RedactionType = RedactionCount['type'];

/**
 * The redaction token grammar (SPEC §9.3, `domain/redaction/redact.ts`): `[TYPE_N]`. The API sends
 * no token spans, so the UI finds tokens by this shape; the types are the contracts' closed list.
 */
const TOKEN_PATTERN = /\[(PERSON|EMAIL|PHONE|URL|ADDRESS|SCHOOL|GRAD_YEAR)_\d+\]/g;

/** An injection guard signal located in the resume. */
export interface InjectionSpan {
  span: TextSpan;
  layer: GuardSignal['layer'];
}

/** Every span the resume view highlights. All spans are offsets into the redacted resume. */
export interface HighlightLayers {
  /** Verified citation spans (amber). */
  citations: readonly TextSpan[];
  /** Guard signals with a location (red). */
  injections: readonly InjectionSpan[];
  /** The citation the user picked, highlighted more strongly and scrolled to. */
  active: TextSpan | null;
}

/** A run of resume text with one combination of highlights. */
export interface Segment {
  start: number;
  end: number;
  /** Exactly `text.slice(start, end)`. */
  text: string;
  token: RedactionType | null;
  citation: boolean;
  active: boolean;
  /** The first segment of the active span: the element to scroll to and focus. */
  activeStart: boolean;
  injection: boolean;
  /**
   * Set on the first segment of each injection region, the union of injection spans that overlap
   * or touch, with the layers inside it. A label goes there once, not once per nested signal.
   */
  injectionRegion: { layers: GuardSignal['layer'][] } | null;
}

interface Region {
  start: number;
  end: number;
  layers: Set<GuardSignal['layer']>;
}

/**
 * Splits a redacted resume into segments at every span boundary, so the view can render each one
 * as a React element with its highlights (never as HTML, ADR 0022). Overlapping spans stack on the
 * same segment. Spans outside the text or empty are dropped: a stale span must not break the page.
 *
 * @example
 * segmentResume('Hi [PERSON_1]', { citations: [], injections: [], active: null });
 * // [{ text: 'Hi ', token: null, … }, { text: '[PERSON_1]', token: 'PERSON', … }]
 */
export function segmentResume(text: string, layers: HighlightLayers): Segment[] {
  const valid = (span: TextSpan) =>
    span.start >= 0 && span.end <= text.length && span.start < span.end;
  const citations = layers.citations.filter(valid);
  const injections = layers.injections.filter((i) => valid(i.span));
  const active = layers.active !== null && valid(layers.active) ? layers.active : null;
  const tokens = findTokens(text);
  const regions = mergeRegions(injections);

  const boundaries = new Set([0, text.length]);
  for (const span of [
    ...citations,
    ...injections.map((i) => i.span),
    ...tokens,
    ...(active ? [active] : []),
  ]) {
    boundaries.add(span.start);
    boundaries.add(span.end);
  }
  const cuts = [...boundaries].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const start = cuts[i] ?? 0;
    const end = cuts[i + 1] ?? text.length;
    const covers = (span: TextSpan) => span.start <= start && end <= span.end;
    const region = regions.find((r) => r.start === start);
    segments.push({
      start,
      end,
      text: text.slice(start, end),
      token: tokens.find(covers)?.type ?? null,
      citation: citations.some(covers),
      active: active !== null && covers(active),
      activeStart: active?.start === start,
      injection: injections.some((i) => covers(i.span)),
      injectionRegion: region ? { layers: [...region.layers].sort() } : null,
    });
  }
  return segments;
}

function findTokens(text: string): (TextSpan & { type: RedactionType })[] {
  return [...text.matchAll(TOKEN_PATTERN)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    // The capture group is one of the pattern's alternatives, all of them redaction types.
    type: match[1] as RedactionType,
  }));
}

function mergeRegions(injections: readonly InjectionSpan[]): Region[] {
  const sorted = [...injections].sort((a, b) => a.span.start - b.span.start);
  const regions: Region[] = [];
  for (const { span, layer } of sorted) {
    const last = regions.at(-1);
    if (last !== undefined && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
      last.layers.add(layer);
    } else {
      regions.push({ start: span.start, end: span.end, layers: new Set([layer]) });
    }
  }
  return regions;
}
