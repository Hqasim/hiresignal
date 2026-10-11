import { TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

import { NotFoundPage } from './not-found-page';

/** Shared look of the text links on this page. */
const LINK =
  'rounded-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Error boundary for every page; the shell stays visible around it. A thrown error's message may
 * be a developer's, so it is never shown. A failed lazy chunk (usually a deploy since the page
 * loaded) is fixed by a reload, which the message suggests.
 */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }
  return (
    <section aria-labelledby="route-error-heading" className="max-w-prose space-y-3">
      <title>Something went wrong · HireSignal</title>
      <h1 id="route-error-heading" className="flex items-center gap-2 text-2xl font-semibold">
        <TriangleAlert aria-hidden className="size-6 text-destructive" />
        Something went wrong
      </h1>
      <p className="text-muted-foreground">
        This page failed to load. Reload to try again; if the app was just updated, a reload fetches
        the new version.
      </p>
      <p className="flex flex-wrap gap-4">
        <button
          type="button"
          className={LINK}
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload the page
        </button>
        <Link to="/" className={LINK}>
          Go to the candidates
        </Link>
      </p>
    </section>
  );
}
