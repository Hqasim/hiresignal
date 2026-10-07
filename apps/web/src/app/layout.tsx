import { Info } from 'lucide-react';
import { Link, Outlet } from 'react-router';

/** App shell: header, synthetic-data banner, page content and footer. */
export function Layout() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
          <Link
            to="/"
            className="rounded-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring"
          >
            HireSignal
          </Link>
        </div>
      </header>
      <div className="border-b bg-muted">
        <p className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          <Info aria-hidden className="size-4 shrink-0" />
          Demo with synthetic data only. No real candidates are shown or stored.
        </p>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t">
        <p className="mx-auto max-w-5xl px-4 py-4 text-sm text-muted-foreground">
          <a
            href="https://github.com/Hqasim/hiresignal"
            className="underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
