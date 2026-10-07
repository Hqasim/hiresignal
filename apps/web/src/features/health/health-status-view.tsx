import type { HealthResponse } from '@hiresignal/contracts';
import { CircleAlert, CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Everything the view can show; the container maps query state onto it. */
export type HealthViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; health: HealthResponse }
  | { kind: 'error'; detail: string };

/**
 * Presentational card for API health. Each state pairs an icon with text, so meaning never
 * depends on color alone, and the status line is announced politely to screen readers.
 */
export function HealthStatusView({ state }: { state: HealthViewState }) {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardDescription>Live check of the HireSignal API.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p role="status" aria-live="polite" className="flex items-center gap-2 font-medium">
          <StatusLine state={state} />
        </p>
        {state.kind === 'ready' && (
          <p className="text-sm text-muted-foreground">
            Build <code>{state.health.gitSha.slice(0, 7)}</code> · LLM mode{' '}
            <code>{state.health.llmMode}</code>
          </p>
        )}
        {state.kind === 'error' && <p className="text-sm text-muted-foreground">{state.detail}</p>}
      </CardContent>
    </Card>
  );
}

function StatusLine({ state }: { state: HealthViewState }) {
  switch (state.kind) {
    case 'loading':
      return (
        <>
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          Checking API…
        </>
      );
    case 'ready':
      return state.health.status === 'ok' ? (
        <>
          <CircleCheck aria-hidden className="size-4 text-emerald-700" />
          API: healthy
        </>
      ) : (
        <>
          <TriangleAlert aria-hidden className="size-4 text-amber-700" />
          API: degraded
        </>
      );
    case 'error':
      return (
        <>
          <CircleAlert aria-hidden className="size-4 text-destructive" />
          API: unreachable
        </>
      );
  }
}
