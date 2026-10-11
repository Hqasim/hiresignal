import { Info } from 'lucide-react';
import { Link, Outlet } from 'react-router';

import { HealthStatus } from '@/features/health/health-status';

import { SiteNav } from './site-nav';

/** Shared focus ring for links in the shell. */
const FOCUS_RING = 'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * App shell: skip link, header navigation, synthetic-data banner, page content and footer. The
 * footer's health check runs on every page load, which also wakes a cold Lambda (SPEC §21).
 */
export function Layout() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className={`font-semibold ${FOCUS_RING}`}>
            HireSignal
          </Link>
          <SiteNav />
        </div>
      </header>
      <div className="border-b bg-muted">
        <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          <Info aria-hidden className="size-4 shrink-0" />
          Demo with synthetic data only. No real candidates are shown or stored.
        </p>
      </div>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none"
      >
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-sm text-muted-foreground">
          <HealthStatus />
          <a
            href="https://github.com/Hqasim/hiresignal"
            className={`underline underline-offset-4 ${FOCUS_RING}`}
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
