import { Navigate } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';

import { useJobs } from './api';

/** Where a redirect leads, given the first job's slug. */
export type JobPath = (slug: string) => string;

/**
 * Sends `/` to the first job's page and `/ask` to its Ask page (SPEC §11). v1 has one job, so
 * the header links here instead of hard-coding a slug.
 */
export function JobRedirect({ to }: { to: JobPath }) {
  const query = useJobs();

  if (query.isPending) {
    return <LoadingState label="Loading jobs…" rows={2} />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} title="Couldn't load the jobs" />;
  }
  const [first] = query.data.jobs;
  if (first === undefined) {
    return (
      <EmptyState title="No jobs yet">
        Seed the demo data with <code>npm run seed</code>, then reload.
      </EmptyState>
    );
  }
  return <Navigate replace to={to(first.slug)} />;
}

/** The job page of `slug`. */
export const jobPath: JobPath = (slug) => `/jobs/${slug}`;

/** The Ask page of `slug`. */
export const askPath: JobPath = (slug) => `/jobs/${slug}/ask`;
