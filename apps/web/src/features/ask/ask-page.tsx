import { useParams } from 'react-router';

import { AskPanel } from './ask-panel';

/** `/jobs/:slug/ask`: questions across the job's talent pool, answered with cited evidence. */
export function AskPage() {
  const { slug = '' } = useParams();
  return (
    <div className="max-w-3xl space-y-6">
      <title>Ask the talent pool · HireSignal</title>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ask the talent pool</h1>
        <p className="text-muted-foreground">
          Questions are answered from the redacted resumes only, with quotes that code checks
          against the text. Quarantined resumes are never searched. When nothing in the pool is
          close enough, you get "not enough evidence" instead of a guess.
        </p>
      </header>
      <AskPanel slug={slug} />
    </div>
  );
}
