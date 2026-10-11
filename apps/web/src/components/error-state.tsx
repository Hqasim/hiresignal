import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError, isQuotaExceeded } from '@/lib/api-client';

import { QuotaBanner } from './quota-banner';

/** Shown when a failure isn't an `ApiError`; its message may be a developer's, so it stays hidden. */
const GENERIC_DETAIL = 'Something went wrong in the app. Reload the page and try again.';

/**
 * The error state of an async view: the problem `detail` (always safe to show, SPEC §10) and the
 * request id to quote in a report. A quota refusal gets the quota banner instead.
 */
export function ErrorState({ error, title }: { error: Error; title: string }) {
  if (isQuotaExceeded(error)) {
    return <QuotaBanner retryAfter={error.retryAfter} />;
  }
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{apiError?.detail ?? GENERIC_DETAIL}</p>
        {apiError?.requestId != null && (
          <p className="text-xs">
            Request id <code>{apiError.requestId}</code>
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
