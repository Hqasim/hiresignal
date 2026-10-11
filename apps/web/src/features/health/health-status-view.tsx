import type { HealthResponse } from '@hiresignal/contracts';
import { CircleAlert, CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';

/** Everything the view can show; the container maps query state onto it. */
export type HealthViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; health: HealthResponse }
  | { kind: 'error'; detail: string };

/**
 * Compact API health line for the footer. Each state pairs an icon with text, so meaning never
 * depends on colour alone, and the status is announced politely to screen readers.
 */
export function HealthStatusView({ state }: { state: HealthViewState }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p role="status" aria-live="polite" className="flex items-center gap-1.5 font-medium">
        <StatusLine state={state} />
      </p>
      {state.kind === 'ready' && (
        <p>
          Build <code>{state.health.gitSha.slice(0, 7)}</code> · LLM mode{' '}
          <code>{state.health.llmMode}</code>
        </p>
      )}
      {state.kind === 'error' && <p>{state.detail}</p>}
    </div>
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
