import { askPath, jobPath, JobRedirect } from './job-redirect';

/** `/`: redirects to the first job's candidates (SPEC §11). */
export function HomePage() {
  return <JobRedirect to={jobPath} />;
}

/** `/ask`: redirects to the first job's Ask page, for the header link. */
export function AskRedirectPage() {
  return <JobRedirect to={askPath} />;
}
