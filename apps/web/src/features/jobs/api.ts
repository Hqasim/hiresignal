import {
  type CandidateListResponse,
  CandidateListResponseSchema,
  type JobDetail,
  JobDetailSchema,
  type JobListResponse,
  JobListResponseSchema,
} from '@hiresignal/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api-client';

/** Query keys for jobs and their ranked candidates. Mutations elsewhere invalidate `candidates`. */
export const jobKeys = {
  all: ['jobs'] as const,
  list: () => [...jobKeys.all, 'list'] as const,
  detail: (slug: string) => [...jobKeys.all, 'detail', slug] as const,
  candidates: (slug: string) => [...jobKeys.all, 'candidates', slug] as const,
};

/** `GET /api/jobs`. */
export function useJobs() {
  return useQuery<JobListResponse>({
    queryKey: jobKeys.list(),
    queryFn: ({ signal }) => apiGet('/api/jobs', JobListResponseSchema, { signal }),
  });
}

/** `GET /api/jobs/:slug`: the job and its rubric. */
export function useJob(slug: string) {
  return useQuery<JobDetail>({
    queryKey: jobKeys.detail(slug),
    queryFn: ({ signal }) =>
      apiGet(`/api/jobs/${encodeURIComponent(slug)}`, JobDetailSchema, { signal }),
  });
}

/** `GET /api/jobs/:slug/candidates`: ranked by the API, quarantined last. */
export function useCandidates(slug: string) {
  return useQuery<CandidateListResponse>({
    queryKey: jobKeys.candidates(slug),
    queryFn: ({ signal }) =>
      apiGet(`/api/jobs/${encodeURIComponent(slug)}/candidates`, CandidateListResponseSchema, {
        signal,
      }),
  });
}
