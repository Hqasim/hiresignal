import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Button } from '@/components/ui/button';
import { formatUtcDateTime } from '@/lib/format';

import { opsKeys, useOpsCalls, useOpsSummary } from './api';
import { CallsTable } from './calls-table';
import { LatencyTable, RouteMix } from './model-tables';
import { StatTiles } from './stat-tiles';

/** `/ops`: today's AI telemetry (SPEC §11, §17). It refreshes on demand, not on a timer. */
export function OpsPage() {
  const client = useQueryClient();
  const summary = useOpsSummary();
  const calls = useOpsCalls();
  const refreshing = summary.isFetching || calls.isFetching;

  return (
    <div className="space-y-8">
      <title>Ops · HireSignal</title>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Ops</h1>
          <p className="max-w-prose text-muted-foreground">
            Model routing, cache hits, latency, fallbacks and the daily quota, for the current UTC
            day. Calls carry metadata only, never prompts or output.
          </p>
          {summary.data && (
            <p className="text-xs text-muted-foreground">
              {summary.data.day}, as of {formatUtcDateTime(summary.data.generatedAt)}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          disabled={refreshing}
          onClick={() => {
            void client.invalidateQueries({ queryKey: opsKeys.all });
          }}
        >
          <RefreshCw aria-hidden className={refreshing ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      </header>

      {summary.isPending && <LoadingState label="Loading today's numbers…" rows={3} />}
      {summary.isError && <ErrorState error={summary.error} title="Couldn't load the summary" />}
      {summary.data && (
        <>
          <StatTiles summary={summary.data} />
          <RouteMix routes={summary.data.routeMix} />
          <LatencyTable models={summary.data.byModel} />
        </>
      )}

      {calls.isPending && <LoadingState label="Loading recent calls…" rows={5} />}
      {calls.isError && <ErrorState error={calls.error} title="Couldn't load recent calls" />}
      {calls.data && <CallsTable calls={calls.data.calls} />}
    </div>
  );
}
