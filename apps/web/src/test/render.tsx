import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';

/** A fresh query client that never retries, so error states appear at once. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Renders `ui` with a fresh query client. */
export function renderWithQueryClient(ui: ReactElement): RenderResult {
  return render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);
}

/** Where a component under test is mounted, and which other routes it can link to. */
export interface RouteOptions {
  /** The URL the memory router starts at. Default `/`. */
  url?: string;
  /** The route pattern `ui` renders at, so `useParams` works. Default `*`. */
  path?: string;
}

/**
 * Renders `ui` inside a memory router and a fresh query client, as the app does. Every other path
 * renders a marker with its pathname and search, so a test can assert where a link led.
 */
export function renderWithProviders(
  ui: ReactElement,
  { url = '/', path = '*' }: RouteOptions = {},
): RenderResult & { router: ReturnType<typeof createMemoryRouter>; client: QueryClient } {
  const client = createTestQueryClient();
  const router = createMemoryRouter(
    [{ path, element: ui }, ...(path === '*' ? [] : [{ path: '*', element: <LocationMarker /> }])],
    { initialEntries: [url] },
  );
  const result = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router, client };
}

function LocationMarker() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}
