import type { OpsSummary } from '@hiresignal/contracts';
import type { ReactNode } from 'react';

import { formatCount, formatMs, formatPercent, formatUtcTime } from '@/lib/format';

/** One headline number with the context that makes it readable. */
export function StatTile({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{children}</dd>
    </div>
  );
}

/**
 * The four headline numbers (SPEC §11): live calls against the daily cap, the cache hit ratio,
 * p95 latency and fallbacks. Tokens, cache and latency cover live calls only, because a replay
 * reads a recorded fixture (SPEC §10); a tile says so when there were none.
 */
export function StatTiles({ summary }: { summary: OpsSummary }) {
  const { cap, totals } = summary;
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Live calls today"
        value={`${formatCount(cap.used)} / ${formatCount(cap.limit)}`}
      >
        Daily cap resets at {formatUtcTime(cap.resetsAt)}. {formatCount(totals.calls)} attempts in
        all, {formatCount(totals.replay)} replayed.
      </StatTile>
      <StatTile label="Cache hit ratio" value={formatPercent(totals.cacheRatio)}>
        {totals.cacheRatio === null
          ? 'No live calls today, so no token usage to measure.'
          : `${formatCount(totals.cachedTokens)} of ${formatCount(totals.inputTokens)} input tokens came from the implicit cache.`}
      </StatTile>
      <StatTile label="p95 latency" value={formatMs(totals.p95LatencyMs)}>
        {totals.p95LatencyMs === null
          ? 'No live calls today.'
          : `p50 ${formatMs(totals.p50LatencyMs)}, live calls only.`}
      </StatTile>
      <StatTile label="Fallbacks" value={formatCount(totals.fallbacks)}>
        Calls retried on the other tier after the routed one failed. {formatCount(totals.errors)}{' '}
        {totals.errors === 1 ? 'attempt' : 'attempts'} ended in an error.
      </StatTile>
    </dl>
  );
}
