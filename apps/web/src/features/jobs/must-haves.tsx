import type { MustHaves as MustHavesCount } from '@hiresignal/contracts';

/**
 * Must-haves met, and how many of those are strong (ADR 0012): a resume of bare skills-list
 * claims meets every must-have with none strong, and the second number shows it.
 */
export function MustHaves({ mustHaves }: { mustHaves: MustHavesCount | null }) {
  if (mustHaves === null) {
    return <span className="text-muted-foreground">–</span>;
  }
  return (
    <span className="tabular-nums">
      {mustHaves.met}/{mustHaves.total} met
      <span className="text-muted-foreground"> · {mustHaves.strong} strong</span>
    </span>
  );
}
