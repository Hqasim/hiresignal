import type { CandidateDetail } from '@hiresignal/contracts';
import { UserCheck } from 'lucide-react';

import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';

import { useShortlist } from './api';

/**
 * Shortlisting is the human checkpoint (SPEC §1): it reveals the name the screening never saw.
 * The API makes it idempotent; once done, the button gives way to a plain status.
 */
export function ShortlistButton({ candidate }: { candidate: CandidateDetail }) {
  const shortlist = useShortlist(candidate.id);

  return (
    <div className="space-y-2">
      {candidate.shortlisted ? (
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <UserCheck aria-hidden className="size-4" />
          Shortlisted
        </p>
      ) : (
        <Button
          disabled={shortlist.isPending}
          onClick={() => {
            shortlist.mutate();
          }}
        >
          <UserCheck aria-hidden />
          {shortlist.isPending ? 'Shortlisting…' : 'Shortlist and reveal name'}
        </Button>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {shortlist.isSuccess ? `Shortlisted. Name revealed: ${candidate.displayName ?? ''}` : ''}
      </p>
      {shortlist.isError && <ErrorState error={shortlist.error} title="Couldn't shortlist" />}
    </div>
  );
}
