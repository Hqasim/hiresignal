import { Link } from 'react-router';

/** Any URL the router doesn't know. */
export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-heading" className="max-w-prose space-y-3">
      <title>Page not found · HireSignal</title>
      <h1 id="not-found-heading" className="text-2xl font-semibold">
        Page not found
      </h1>
      <p className="text-muted-foreground">There is nothing at this address.</p>
      <Link
        to="/"
        className="rounded-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Go to the candidates
      </Link>
    </section>
  );
}
