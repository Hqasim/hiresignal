import type { Citation, Scorecard, TextSpan } from '@hiresignal/contracts';
import type { ReactNode } from 'react';

import { MustHaves } from '@/features/jobs/must-haves';
import { formatUtcDateTime } from '@/lib/format';

import { RequirementRow } from './requirement-row';

/**
 * The latest scorecard (SPEC §11): the score computed in code, must-haves, one row per requirement
 * with clickable citations, strengths, concerns and the summary, then how it was produced.
 * `trace` renders below, so the agent timeline can be cut without touching this panel.
 */
export function ScorecardPanel({
  scorecard,
  activeSpan,
  onCite,
  trace,
}: {
  scorecard: Scorecard;
  activeSpan: TextSpan | null;
  onCite: (citation: Citation) => void;
  trace?: ReactNode;
}) {
  return (
    <section aria-labelledby="scorecard-heading" className="space-y-5">
      <div className="space-y-1">
        <h2 id="scorecard-heading" className="text-lg font-semibold">
          Scorecard
        </h2>
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>
            <span className="text-3xl font-semibold tabular-nums">{scorecard.score}</span>
            <span className="text-muted-foreground"> / 100</span>
          </span>
          <span className="text-sm">
            Must-haves: <MustHaves mustHaves={scorecard.mustHaves} />
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          The score is computed in code from the ratings and the job's weights; the model never
          chooses the number. Every quote below was found in the resume by code.
        </p>
      </div>

      {scorecard.summary !== '' && <p className="text-sm">{scorecard.summary}</p>}

      <div>
        <h3 className="text-sm font-semibold">Requirements</h3>
        <ol className="divide-y">
          {scorecard.requirements.map((result) => (
            <RequirementRow
              key={result.requirementId}
              result={result}
              activeSpan={activeSpan}
              onCite={onCite}
            />
          ))}
        </ol>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PointList title="Strengths" points={scorecard.strengths} />
        <PointList title="Concerns" points={scorecard.concerns} />
      </div>

      <p className="text-xs text-muted-foreground">
        Screened {formatUtcDateTime(scorecard.createdAt)} with prompt{' '}
        <code>{scorecard.promptVersion}</code>: agent <code>{scorecard.models.agent}</code>,
        synthesis <code>{scorecard.models.synthesis}</code>.
      </p>
      {trace}
    </section>
  );
}

function PointList({ title, points }: { title: string; points: readonly string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">None noted.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
