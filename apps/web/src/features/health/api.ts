import { type HealthResponse, HealthResponseSchema } from '@hiresignal/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api-client';

/** Query keys for the health feature. */
export const healthKeys = {
  all: ['health'] as const,
};

/**
 * Fetches `GET /api/health`. Calling it on page load also warms the Lambda (SPEC §17).
 */
export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: healthKeys.all,
    queryFn: ({ signal }) => apiGet('/api/health', HealthResponseSchema, { signal }),
  });
}
