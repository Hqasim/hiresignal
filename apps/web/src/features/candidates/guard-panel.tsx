import type { CandidateDetail, GuardSignal } from '@hiresignal/contracts';

import { GuardBadge } from '@/features/jobs/guard-badge';
import { formatPercent } from '@/lib/format';

/** What each status means for the recruiter, in one sentence. */
const STATUS_EXPLANATION: Record<CandidateDetail['guard']['status'], string> = {
  clean: 'No layer found an instruction aimed at an AI screener.',
  flagged: 'A layer found something suspicious. The resume was screened; read it with care.',
  quarantined:
    'This resume carries instructions aimed at AI screeners. It was never indexed or scored, so no model read it as evidence.',
};

/**
 * The injection guard's verdict (SPEC §9.4): the status, each signal with its layer and severity,
 * signals that fired on benign text and were dismissed, and the classifier's verdict.
 */
export function GuardPanel({ guard }: { guard: CandidateDetail['guard'] }) {
  return (
    <section aria-labelledby="guard-heading" className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="guard-heading" className="text-lg font-semibold">
          Injection guard
        </h2>
        <GuardBadge status={guard.status} />
      </div>
      <p className="text-sm text-muted-foreground">{STATUS_EXPLANATION[guard.status]}</p>
      {guard.signals.length > 0 && <SignalList title="Signals" signals={guard.signals} />}
      {guard.dismissed.length > 0 && (
        <SignalList
          title="Dismissed signals"
          description="These rules fired on benign text, and the policy dismissed them."
          signals={guard.dismissed}
        />
      )}
      {guard.classifier === null ? (
        guard.status === 'quarantined' && (
          <p className="text-sm text-muted-foreground">
            Classifier skipped: a high-severity rule had already quarantined the resume.
          </p>
        )
      ) : (
        <div className="space-y-1 text-sm">
          <h3 className="font-semibold">Classifier (L3)</h3>
          <p>
            {guard.classifier.verdict}, {formatPercent(guard.classifier.confidence)} confidence
          </p>
          {guard.classifier.rationale !== '' && (
            <p className="text-muted-foreground">{guard.classifier.rationale}</p>
          )}
        </div>
      )}
    </section>
  );
}

function SignalList({
  title,
  description,
  signals,
}: {
  title: string;
  description?: string;
  signals: readonly GuardSignal[];
}) {
  return (
    <div className="space-y-1 text-sm">
      <h3 className="font-semibold">{title}</h3>
      {description !== undefined && <p className="text-muted-foreground">{description}</p>}
      <ul className="space-y-2">
        {signals.map((signal, index) => (
          <li key={`${signal.id}-${String(index)}`} className="rounded-md bg-muted/50 px-2 py-1.5">
            <p>
              <span className="font-medium">{signal.layer}</span> · {signal.severity} ·{' '}
              {signal.label}
            </p>
            <p className="font-mono text-xs break-words text-muted-foreground">{signal.excerpt}</p>
            {signal.span === null && (
              <p className="text-xs text-muted-foreground">
                Not highlighted: found in the original text, before redaction.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
