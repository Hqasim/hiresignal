import {
  type CandidateDetail,
  CandidateDetailSchema,
  type ScreenResponse,
  ScreenResponseSchema,
} from '@hiresignal/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { jobKeys } from '@/features/jobs/api';
import { apiGet, apiPost } from '@/lib/api-client';

/** Query keys for candidate details. */
export const candidateKeys = {
  all: ['candidates'] as const,
  detail: (id: string) => [...candidateKeys.all, 'detail', id] as const,
};

/** Every job's ranked list: shortlisting or re-screening a candidate changes their row. */
const ALL_CANDIDATE_LISTS = [...jobKeys.all, 'candidates'] as const;

function candidatePath(id: string, action = ''): string {
  return `/api/candidates/${encodeURIComponent(id)}${action}`;
}

/** `GET /api/candidates/:id`: redacted resume, guard verdict and latest scorecard. */
export function useCandidate(id: string) {
  return useQuery<CandidateDetail>({
    queryKey: candidateKeys.detail(id),
    queryFn: ({ signal }) => apiGet(candidatePath(id), CandidateDetailSchema, { signal }),
  });
}

/**
 * `POST /api/candidates/:id/shortlist`: the human decision that reveals the name. The response is
 * the full detail, so it replaces the cached one; the ranked lists refetch for the new name.
 */
export function useShortlist(id: string) {
  const client = useQueryClient();
  return useMutation<CandidateDetail>({
    mutationFn: () => apiPost(candidatePath(id, '/shortlist'), CandidateDetailSchema),
    onSuccess: async (detail) => {
      client.setQueryData(candidateKeys.detail(id), detail);
      await client.invalidateQueries({ queryKey: ALL_CANDIDATE_LISTS });
    },
  });
}

/**
 * `POST /api/candidates/:id/screen`: re-runs the agent live, behind the daily cap. The detail and
 * the ranked lists refetch, so the new score and must-haves come from the API, not from the UI.
 */
export function useRescreen(id: string) {
  const client = useQueryClient();
  return useMutation<ScreenResponse>({
    mutationFn: () => apiPost(candidatePath(id, '/screen'), ScreenResponseSchema),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: candidateKeys.detail(id) }),
        client.invalidateQueries({ queryKey: ALL_CANDIDATE_LISTS }),
      ]);
    },
  });
}
