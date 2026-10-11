import type { AgentTraceEntry } from '@hiresignal/contracts';
import { ChevronRight } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCount, formatMs } from '@/lib/format';

/**
 * The screening agent's tool calls in order (SPEC §9.6): tool, arguments, the chunk refs it got
 * back, latency and tokens. Refs only, never resume text. Collapsed by default.
 */
export function AgentTraceTimeline({ trace }: { trace: readonly AgentTraceEntry[] }) {
  if (trace.length === 0) {
    return null;
  }
  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight
          aria-hidden
          className="size-4 transition-transform group-data-[state=open]:rotate-90"
        />
        Agent trace ({trace.length} tool {trace.length === 1 ? 'call' : 'calls'})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="space-y-3 border-t px-3 py-3 text-sm">
          {trace.map((entry, index) => (
            <li key={index} className="border-l-2 pl-3">
              <p>
                <span className="text-muted-foreground">Step {entry.step} · </span>
                <code>{entry.tool}</code>
                <span className="text-muted-foreground"> · {formatMs(entry.latencyMs)}</span>
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted-foreground">
                {Object.entries(entry.args).map(([name, value]) => (
                  <div key={name} className="contents">
                    <dt>{name}</dt>
                    <dd className="break-words text-foreground">{value}</dd>
                  </div>
                ))}
                <dt>returned</dt>
                <dd className="font-mono">
                  {entry.returnedRefs.length === 0 ? 'nothing' : entry.returnedRefs.join(', ')}
                </dd>
                {entry.tokens !== null && (
                  <>
                    <dt>tokens</dt>
                    <dd>
                      {formatCount(entry.tokens.input)} in · {formatCount(entry.tokens.output)} out
                      · {formatCount(entry.tokens.cached)} cached
                    </dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
