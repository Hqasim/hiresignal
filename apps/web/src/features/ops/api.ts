import {
  type LlmCallListResponse,
  LlmCallListResponseSchema,
  type OpsSummary,
  OpsSummarySchema,
} from '@hiresignal/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api-client';

/** How many recent calls the ops page lists. */
export const RECENT_CALLS_LIMIT = 50;

/** Query keys for the ops page; Refresh invalidates `all`. */
export const opsKeys = {
  all: ['ops'] as const,
  summary: () => [...opsKeys.all, 'summary'] as const,
  calls: (limit: number) => [...opsKeys.all, 'calls', limit] as const,
};

/** `GET /api/ops/summary`: today's model calls against the cap, by model and by route. */
export function useOpsSummary() {
  return useQuery<OpsSummary>({
    queryKey: opsKeys.summary(),
    queryFn: ({ signal }) => apiGet('/api/ops/summary', OpsSummarySchema, { signal }),
  });
}

/** `GET /api/ops/calls?limit=`: the latest call attempts, metadata only. */
export function useOpsCalls(limit = RECENT_CALLS_LIMIT) {
  return useQuery<LlmCallListResponse>({
    queryKey: opsKeys.calls(limit),
    queryFn: ({ signal }) =>
      apiGet(`/api/ops/calls?limit=${String(limit)}`, LlmCallListResponseSchema, { signal }),
  });
}
