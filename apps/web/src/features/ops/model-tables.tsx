import type { LlmModelStats, RouteCount } from '@hiresignal/contracts';

import { EmptyState } from '@/components/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCount, formatMs, formatPercent } from '@/lib/format';

/** Generation attempts by tier and routing rule (SPEC §9.1), most frequent first. */
export function RouteMix({ routes }: { routes: readonly RouteCount[] }) {
  return (
    <section aria-labelledby="route-mix-heading" className="space-y-3">
      <h2 id="route-mix-heading" className="text-lg font-semibold">
        Route mix
      </h2>
      {routes.length === 0 ? (
        <EmptyState title="No generation calls today" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tier</TableHead>
              <TableHead>Routing rule</TableHead>
              <TableHead className="text-right">Calls</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => (
              <TableRow key={`${route.tier}-${route.routedReason}`}>
                <TableCell>{route.tier}</TableCell>
                <TableCell>{route.routedReason}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(route.calls)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** Latency, tokens and failures per model; token and latency columns cover live calls only. */
export function LatencyTable({ models }: { models: readonly LlmModelStats[] }) {
  return (
    <section aria-labelledby="by-model-heading" className="space-y-3">
      <h2 id="by-model-heading" className="text-lg font-semibold">
        By model
      </h2>
      {models.length === 0 ? (
        <EmptyState title="No model calls today" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Calls (live / replay)</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p95</TableHead>
              <TableHead className="text-right">Input tokens</TableHead>
              <TableHead className="text-right">Cached</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead className="text-right">Fallbacks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((model) => (
              <TableRow key={model.model}>
                <TableCell className="font-mono text-xs">{model.model}</TableCell>
                <TableCell>{model.tier}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(model.live)} / {formatCount(model.replay)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMs(model.p50LatencyMs)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMs(model.p95LatencyMs)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(model.inputTokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(model.cacheRatio)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(model.errors)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(model.fallbacks)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
