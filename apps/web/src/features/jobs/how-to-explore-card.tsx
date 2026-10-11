import { X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

/** Remembers the dismissal per browser. Losing it (private window, cleared storage) only shows the card again. */
const STORAGE_KEY = 'hiresignal.how-to-explore.dismissed';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Storage is blocked: the card is hidden for this visit only.
  }
}

/** The first-visit guide to the 60-second tour (SPEC §3, §11), until the visitor dismisses it. */
export function HowToExploreCard({ askHref }: { askHref: string }) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed) {
    return null;
  }
  return (
    <section
      aria-labelledby="how-to-explore-heading"
      className="relative space-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm"
    >
      <h2 id="how-to-explore-heading" className="font-semibold">
        How to explore
      </h2>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Open the top candidate and click a citation: the exact resume line lights up.</li>
        <li>Open C06 in the quarantined section to see the hidden instruction the guard caught.</li>
        <li>Shortlist a candidate to reveal their name, the human decision point.</li>
        <li>
          <Link to={askHref} className="underline underline-offset-4">
            Ask the talent pool
          </Link>{' '}
          a question and follow its citations.
        </li>
        <li>
          Check{' '}
          <Link to="/ops" className="underline underline-offset-4">
            Ops
          </Link>{' '}
          for model routing, cache hits and the daily quota.
        </li>
      </ol>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss the guide"
        className="absolute top-2 right-2"
        onClick={() => {
          rememberDismissal();
          setDismissed(true);
        }}
      >
        <X aria-hidden />
      </Button>
    </section>
  );
}
