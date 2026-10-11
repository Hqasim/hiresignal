import { type CandidateDetail, CandidateDetailSchema } from '@hiresignal/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api-client';

/** Query keys for candidate details. */
export const candidateKeys = {
  all: ['candidates'] as const,
  detail: (id: string) => [...candidateKeys.all, 'detail', id] as const,
};

/** `GET /api/candidates/:id`: redacted resume, guard verdict and latest scorecard. */
export function useCandidate(id: string) {
  return useQuery<CandidateDetail>({
    queryKey: candidateKeys.detail(id),
    queryFn: ({ signal }) =>
      apiGet(`/api/candidates/${encodeURIComponent(id)}`, CandidateDetailSchema, { signal }),
  });
}
