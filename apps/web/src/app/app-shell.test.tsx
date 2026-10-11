import type { HealthResponse, JobListResponse } from '@hiresignal/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { createMemoryRouter, type RouteObject, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw-server';
import { createTestQueryClient } from '@/test/render';

import { Layout } from './layout';
import { RouteError } from './route-error';
import { routes } from './router';

const health: HealthResponse = { status: 'ok', db: 'up', llmMode: 'replay', gitSha: 'abc1234def' };
const jobs: JobListResponse = {
  jobs: [
    {
      slug: 'senior-fullstack-ai',
      title: 'Senior Full-Stack Engineer, AI Platform',
      company: 'Northbeam Analytics',
      requirementCount: 7,
    },
  ],
};

function renderApp(url: string, routeTable: RouteObject[] = routes, jobList = jobs) {
  server.use(
    http.get('*/api/health', () => HttpResponse.json(health)),
    http.get('*/api/jobs', () => HttpResponse.json(jobList)),
  );
  const router = createMemoryRouter(routeTable, { initialEntries: [url] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('app shell', () => {
  it('redirects / to the first job’s candidates', async () => {
    const home = renderApp('/');

    await waitFor(() => {
      expect(home.state.location.pathname).toBe('/jobs/senior-fullstack-ai');
    });
  });

  it('redirects /ask to the first job’s Ask page', async () => {
    const ask = renderApp('/ask');

    await waitFor(() => {
      expect(ask.state.location.pathname).toBe('/jobs/senior-fullstack-ai/ask');
    });
  });

  it('tells the user to seed when there are no jobs', async () => {
    renderApp('/', routes, { jobs: [] });

    expect(await screen.findByText('No jobs yet')).toBeInTheDocument();
  });

  it.each([
    ['/candidates/00000000-0000-4000-8000-000000000001', 'Candidates'],
    ['/jobs/senior-fullstack-ai/ask', 'Ask'],
    ['/ops', 'Ops'],
    ['/about', 'About'],
  ])('marks the current section in the navigation on %s', async (url, label) => {
    renderApp(url);

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    expect(
      within(nav)
        .getAllByRole('link')
        .filter((link) => link.hasAttribute('aria-current')),
    ).toHaveLength(1);
  });

  it('offers a skip link to the main content, the synthetic-data banner and the API status', async () => {
    renderApp('/nowhere');

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByText(/synthetic data only/)).toBeInTheDocument();
    expect(await screen.findByText('API: healthy')).toBeInTheDocument();
  });

  it('shows "Page not found" inside the shell for an unknown URL', async () => {
    renderApp('/nowhere');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('keeps the shell and hides the error message when a page throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Broken(): never {
      throw new Error('secret internal detail');
    }
    renderApp('/broken', [
      {
        element: <Layout />,
        children: [
          { errorElement: <RouteError />, children: [{ path: 'broken', Component: Broken }] },
        ],
      },
    ]);

    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret internal detail/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
