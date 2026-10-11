import type { Citation } from '@hiresignal/contracts';
import { Quote } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Longest part of a quote shown on the chip; the full quote is highlighted in the resume. */
const CHIP_QUOTE_CHARS = 72;

/**
 * A verified citation as a button: pressing it highlights the quote in the resume and scrolls to
 * it. `aria-pressed` tells assistive tech which citation is showing.
 */
export function CitationChip({
  citation,
  active,
  onSelect,
}: {
  citation: Citation;
  active: boolean;
  onSelect: (citation: Citation) => void;
}) {
  const shown =
    citation.quote.length > CHIP_QUOTE_CHARS
      ? `${citation.quote.slice(0, CHIP_QUOTE_CHARS).trimEnd()}…`
      : citation.quote;
  return (
    <button
      type="button"
      aria-pressed={active}
      title={citation.quote}
      onClick={() => {
        onSelect(citation);
      }}
      className={cn(
        'inline-flex max-w-full items-start gap-1.5 rounded-md border px-2 py-1 text-left text-xs outline-none hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-amber-600 bg-amber-100' : 'border-amber-300',
      )}
    >
      <Quote aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        <span className="sr-only">Show quote in resume: </span>
        {shown}
        <span className="text-muted-foreground"> · {citation.section}</span>
      </span>
    </button>
  );
}
