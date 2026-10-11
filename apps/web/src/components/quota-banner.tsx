import { Gauge } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatWait } from '@/lib/format';

/**
 * Explains a 429 from the daily cap (SPEC §10, ADR 0015): live model calls are paused, but every
 * precomputed scorecard and candidate page still works.
 */
export function QuotaBanner({ retryAfter }: { retryAfter: number | null }) {
  return (
    <Alert>
      <Gauge aria-hidden />
      <AlertTitle>Today's model-call quota is used up</AlertTitle>
      <AlertDescription>
        <p>
          Precomputed scorecards, candidate pages and the ops page still work. Live screening and
          questions resume{' '}
          {retryAfter === null ? 'at midnight UTC' : `in ${formatWait(retryAfter)} (midnight UTC)`}.
        </p>
      </AlertDescription>
    </Alert>
  );
}
