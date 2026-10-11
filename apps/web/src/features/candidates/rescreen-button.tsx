import type { CandidateDetail } from '@hiresignal/contracts';
import { RefreshCw } from 'lucide-react';

import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';

import { useRescreen } from './api';

/**
 * Re-runs screening live for one candidate (SPEC §4 Should). It spends model calls against the
 * daily cap, so a refusal shows the quota banner. Quarantined candidates are never screened.
 */
export function RescreenButton({ candidate }: { candidate: CandidateDetail }) {
  const rescreen = useRescreen(candidate.id);
  if (candidate.guardStatus === 'quarantined') {
    return null;
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={rescreen.isPending}
        onClick={() => {
          rescreen.mutate();
        }}
      >
        <RefreshCw aria-hidden className={rescreen.isPending ? 'animate-spin' : undefined} />
        {rescreen.isPending ? 'Screening…' : 'Re-run screening'}
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {rescreen.isPending &&
          'The agent is gathering evidence. A live run can take up to a minute.'}
        {rescreen.isSuccess && 'Screening finished. The scorecard shows the new result.'}
      </p>
      {rescreen.isError && <ErrorState error={rescreen.error} title="Couldn't re-run screening" />}
    </div>
  );
}
