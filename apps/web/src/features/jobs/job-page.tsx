import { useParams } from 'react-router';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';

import { useCandidates, useJob } from './api';
import { CandidateTable } from './candidate-table';
import { HowToExploreCard } from './how-to-explore-card';
import { JobHeader } from './job-header';
import { askPath } from './job-redirect';
import { RequirementList } from './requirement-list';

/** `/jobs/:slug`: the job, its rubric and its ranked candidates (SPEC §11). */
export function JobPage() {
  const { slug = '' } = useParams();
  const job = useJob(slug);
  const candidates = useCandidates(slug);

  return (
    <div className="space-y-8">
      <title>{job.data ? `${job.data.title} · HireSignal` : 'Candidates · HireSignal'}</title>
      {job.isPending && <LoadingState label="Loading the job…" rows={2} />}
      {job.isError && <ErrorState error={job.error} title="Couldn't load the job" />}
      {job.data && <JobHeader job={job.data} />}
      <HowToExploreCard askHref={askPath(slug)} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          {candidates.isPending && <LoadingState label="Loading candidates…" rows={6} />}
          {candidates.isError && (
            <ErrorState error={candidates.error} title="Couldn't load the candidates" />
          )}
          {candidates.data && <CandidateTable candidates={candidates.data.candidates} />}
        </div>
        {job.data && <RequirementList requirements={job.data.requirements} />}
      </div>
    </div>
  );
}
