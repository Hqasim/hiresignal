import { OctagonAlert } from 'lucide-react';
import { type Ref, useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

import { type HighlightLayers, type RedactionType, type Segment, segmentResume } from './highlight';

/** How each redaction token type reads to a screen reader. */
const TOKEN_NAMES: Record<RedactionType, string> = {
  PERSON: 'name',
  EMAIL: 'email address',
  PHONE: 'phone number',
  URL: 'link',
  ADDRESS: 'street address',
  SCHOOL: 'school',
  GRAD_YEAR: 'graduation year',
};

/**
 * The redacted resume as text with highlight layers (SPEC §11, ADR 0022): citations amber, the
 * picked citation stronger and scrolled into view, injection spans red with an icon and a label,
 * and redaction tokens as neutral pills. Every layer has a non-colour cue (underline style, label
 * or pill shape). Text is rendered as React text nodes, never as HTML, so a hidden HTML comment
 * shows up as the literal text it is. Changing `scrollKey` scrolls to the active span again, so
 * picking the same citation twice brings it back into view.
 */
export function RedactedResumeView({
  text,
  layers,
  scrollKey = 0,
}: {
  text: string;
  layers: HighlightLayers;
  scrollKey?: number;
}) {
  const segments = useMemo(() => segmentResume(text, layers), [text, layers]);
  const activeRef = useRef<HTMLElement>(null);
  const activeStart = layers.active?.start;
  const activeEnd = layers.active?.end;

  useEffect(() => {
    if (activeStart === undefined || activeEnd === undefined) {
      return;
    }
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    activeRef.current?.focus({ preventScroll: true });
  }, [activeStart, activeEnd, scrollKey]);

  return (
    // No ligatures: the resume shows its literal characters, so a comment's --> must not become an arrow.
    <div className="text-sm leading-relaxed break-words whitespace-pre-wrap [font-variant-ligatures:none]">
      {segments.map((segment) => (
        <SegmentView
          key={segment.start}
          segment={segment}
          ref={segment.activeStart ? activeRef : undefined}
        />
      ))}
    </div>
  );
}

function SegmentView({ segment, ref }: { segment: Segment; ref: Ref<HTMLElement> | undefined }) {
  const content =
    segment.token === null ? (
      segment.text
    ) : (
      <span className="mx-px rounded-full border bg-muted px-1.5 py-px font-mono text-xs text-muted-foreground">
        {segment.text}
        <span className="sr-only"> (redacted {TOKEN_NAMES[segment.token]})</span>
      </span>
    );

  const label = segment.injectionRegion && (
    <span className="mr-1 inline-flex items-center gap-1 rounded-sm bg-red-700 px-1 py-px align-baseline font-sans text-xs font-medium whitespace-nowrap text-white">
      <OctagonAlert aria-hidden className="size-3" />
      Injection ({segment.injectionRegion.layers.join(', ')})
    </span>
  );

  if (!segment.citation && !segment.injection) {
    return content;
  }
  return (
    <>
      {label}
      <mark
        ref={ref}
        tabIndex={segment.activeStart ? -1 : undefined}
        data-active={segment.active || undefined}
        className={cn(
          'rounded-sm text-foreground outline-none',
          segment.citation &&
            'bg-amber-100 underline decoration-amber-600 decoration-dotted underline-offset-4',
          segment.active && 'bg-amber-300 decoration-solid',
          segment.injection &&
            'bg-red-100 text-red-950 underline decoration-red-700 decoration-wavy underline-offset-4',
          segment.activeStart && 'focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {segment.activeStart && <span className="sr-only">Cited quote: </span>}
        {content}
      </mark>
    </>
  );
}
