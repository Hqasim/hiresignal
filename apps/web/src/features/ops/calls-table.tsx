import type { LlmCallRow } from '@hiresignal/contracts';

import { EmptyState } from '@/components/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCount, formatMs, formatUtcDateTime, NO_VALUE } from '@/lib/format';

function tokens(value: number | null): string {
  return value === null ? NO_VALUE : formatCount(value);
}

/**
 * The latest model call attempts: metadata only, never prompts or output (SPEC §17). Source,
 * status and fallback are words, not colours.
 */
export function CallsTable({ calls }: { calls: readonly LlmCallRow[] }) {
  return (
    <section aria-labelledby="calls-heading" className="space-y-3">
      <h2 id="calls-heading" className="text-lg font-semibold">
        Recent calls
      </h2>
      {calls.length === 0 ? (
        <EmptyState title="No model calls recorded yet">
          Seeding, a re-run or a question records them here.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Tokens in / out / cached</TableHead>
              <TableHead className="text-right">Latency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => (
              <TableRow key={call.id}>
                <TableCell className="whitespace-nowrap">
                  {formatUtcDateTime(call.createdAt)}
                </TableCell>
                <TableCell className="font-mono text-xs">{call.task}</TableCell>
                <TableCell className="font-mono text-xs">{call.model}</TableCell>
                <TableCell>
                  {call.tier} · {call.routedReason}
                  {call.isFallback && ' · fallback'}
                </TableCell>
                <TableCell>{call.source}</TableCell>
                <TableCell>
                  {call.status === 'rate_limited' ? 'rate limited' : call.status}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {tokens(call.inputTokens)} / {tokens(call.outputTokens)} /{' '}
                  {tokens(call.cachedTokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMs(call.latencyMs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
