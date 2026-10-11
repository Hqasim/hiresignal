/**
 * A 0–100 score as a number with a bar behind it. The number carries the meaning; the bar only
 * helps the eye compare rows, so it is hidden from screen readers.
 */
export function ScoreBar({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-muted-foreground">Not scored</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="w-8 text-right font-medium tabular-nums">{score}</span>
      <span aria-hidden className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${String(score)}%` }}
        />
      </span>
    </span>
  );
}
