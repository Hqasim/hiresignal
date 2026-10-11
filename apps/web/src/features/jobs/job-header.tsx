import type { JobDetail } from '@hiresignal/contracts';

/**
 * The job's title, company and the first paragraph of its description, with the rest one click
 * away. The description is shown as plain text: the app renders no Markdown or HTML it receives.
 */
export function JobHeader({ job }: { job: JobDetail }) {
  const [lead = '', ...rest] = job.description.trim().split(/\n\s*\n/);
  return (
    <header className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground">{job.company}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
      </div>
      {lead !== '' && <p className="max-w-prose text-muted-foreground">{lead}</p>}
      {rest.length > 0 && (
        <details className="max-w-prose text-sm">
          <summary className="w-fit cursor-pointer rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            Full job description
          </summary>
          <div className="mt-2 space-y-3 whitespace-pre-line text-muted-foreground">
            {rest.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </details>
      )}
    </header>
  );
}
