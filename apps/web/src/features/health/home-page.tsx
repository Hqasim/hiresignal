import { HealthStatus } from './health-status';

/**
 * Walking-skeleton home page: proves the deployed SPA reaches the deployed API.
 * Phase 8 replaces `/` with a redirect to the job page (SPEC §11).
 */
export function HomePage() {
  return (
    <section aria-labelledby="home-heading" className="space-y-6">
      <div className="space-y-2">
        <h1 id="home-heading" className="text-2xl font-semibold tracking-tight">
          HireSignal
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Blind, injection-aware candidate screening. Every score is backed by evidence you can
          click.
        </p>
      </div>
      <HealthStatus />
    </section>
  );
}
