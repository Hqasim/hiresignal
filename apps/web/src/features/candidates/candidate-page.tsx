import type { CandidateDetail, Citation, TextSpan } from '@hiresignal/contracts';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { GuardBadge } from '@/features/jobs/guard-badge';

import { useCandidate } from './api';
import { CITE_PARAM, parseCiteParam } from './cite-param';
import { GuardPanel } from './guard-panel';
import type { HighlightLayers } from './highlight';
import { RedactedResumeView } from './redacted-resume-view';
import { RedactionSummary } from './redaction-summary';
import { ScorecardPanel } from './scorecard-panel';

/** `/candidates/:id`: the redacted resume beside the guard verdict and the scorecard (SPEC §11). */
export function CandidatePage() {
  const { id = '' } = useParams();
  const query = useCandidate(id);

  return (
    <div className="space-y-6">
      <title>
        {query.data ? `${candidateName(query.data)} · HireSignal` : 'Candidate · HireSignal'}
      </title>
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All candidates
      </Link>
      {query.isPending && <LoadingState label="Loading the candidate…" rows={8} />}
      {query.isError && <ErrorState error={query.error} title="Couldn't load the candidate" />}
      {query.data && <CandidateView candidate={query.data} />}
    </div>
  );
}

/** The name once shortlisted, otherwise the alias (blind screening). */
function candidateName(candidate: CandidateDetail): string {
  return candidate.displayName ?? candidate.alias;
}

function CandidateView({ candidate }: { candidate: CandidateDetail }) {
  const [searchParams] = useSearchParams();
  const [activeSpan, setActiveSpan] = useState<TextSpan | null>(() =>
    parseCiteParam(searchParams.get(CITE_PARAM)),
  );
  const [scrollKey, setScrollKey] = useState(0);
  const layers = useMemo<HighlightLayers>(
    () => ({
      citations:
        candidate.scorecard?.requirements.flatMap((r) => r.citations.map((c) => c.span)) ?? [],
      injections: candidate.guard.signals.flatMap((signal) =>
        signal.span === null ? [] : [{ span: signal.span, layer: signal.layer }],
      ),
      active: activeSpan,
    }),
    [candidate, activeSpan],
  );
  const onCite = (citation: Citation) => {
    setActiveSpan(citation.span);
    setScrollKey((key) => key + 1);
  };

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {candidateName(candidate)}
          {candidate.displayName !== null && (
            <span className="text-muted-foreground"> ({candidate.alias})</span>
          )}
        </h1>
        <GuardBadge status={candidate.guardStatus} />
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="resume-heading" className="space-y-3 rounded-lg border p-4">
          <h2 id="resume-heading" className="text-lg font-semibold">
            Redacted resume
          </h2>
          <div className="max-h-[75vh] overflow-y-auto pr-2">
            <RedactedResumeView
              text={candidate.redactedResume}
              layers={layers}
              scrollKey={scrollKey}
            />
          </div>
        </section>
        <div className="space-y-6">
          {candidate.guardStatus !== 'clean' || candidate.guard.dismissed.length > 0 ? (
            <GuardPanel guard={candidate.guard} />
          ) : null}
          {candidate.scorecard === null ? (
            <NoScorecard quarantined={candidate.guardStatus === 'quarantined'} />
          ) : (
            <ScorecardPanel
              scorecard={candidate.scorecard}
              activeSpan={activeSpan}
              onCite={onCite}
            />
          )}
          <RedactionSummary counts={candidate.redactionSummary} />
          {candidate.guardStatus === 'clean' && candidate.guard.dismissed.length === 0 && (
            <GuardPanel guard={candidate.guard} />
          )}
        </div>
      </div>
    </>
  );
}

function NoScorecard({ quarantined }: { quarantined: boolean }) {
  return (
    <section aria-labelledby="scorecard-heading" className="space-y-1">
      <h2 id="scorecard-heading" className="text-lg font-semibold">
        Scorecard
      </h2>
      <p className="text-sm text-muted-foreground">
        {quarantined ? 'No score: quarantined resumes are never scored.' : 'Not screened yet.'}
      </p>
    </section>
  );
}
