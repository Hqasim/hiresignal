import { QueryClient } from '@tanstack/react-query';

/** How long fetched data counts as fresh before a background refetch. */
const STALE_TIME_MS = 30_000;

/** Builds the app's TanStack Query client; tests build their own with retries off. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: STALE_TIME_MS, retry: 1, refetchOnWindowFocus: false },
    },
  });
}
