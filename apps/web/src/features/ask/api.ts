import { type AskResponse, AskResponseSchema } from '@hiresignal/contracts';
import { useMutation } from '@tanstack/react-query';

import { apiPost } from '@/lib/api-client';

/**
 * `POST /api/jobs/:slug/ask`: a question across the talent pool, behind the daily cap. A mutation,
 * not a query: each ask may spend a model call, so it runs only when the recruiter submits.
 */
export function useAsk(slug: string) {
  return useMutation<AskResponse, Error, string>({
    mutationFn: (question) =>
      apiPost(`/api/jobs/${encodeURIComponent(slug)}/ask`, AskResponseSchema, { question }),
  });
}
