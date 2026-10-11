import { createBrowserRouter, type RouteObject } from 'react-router';

import { Layout } from './layout';
import { NotFoundPage } from './not-found-page';
import { RouteError } from './route-error';

/**
 * Every page, each a lazy chunk, so the first load ships only the shell (SPEC §11). The pages sit
 * under a pathless route that holds the error boundary, so a failing page keeps the header and
 * footer.
 */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          {
            index: true,
            lazy: async () => {
              const { HomePage } = await import('@/features/jobs/home-page');
              return { Component: HomePage };
            },
          },
          {
            path: 'ask',
            lazy: async () => {
              const { AskRedirectPage } = await import('@/features/jobs/home-page');
              return { Component: AskRedirectPage };
            },
          },
          {
            path: 'jobs/:slug',
            lazy: async () => {
              const { JobPage } = await import('@/features/jobs/job-page');
              return { Component: JobPage };
            },
          },
          {
            path: 'jobs/:slug/ask',
            lazy: async () => {
              const { AskPage } = await import('@/features/ask/ask-page');
              return { Component: AskPage };
            },
          },
          {
            path: 'candidates/:id',
            lazy: async () => {
              const { CandidatePage } = await import('@/features/candidates/candidate-page');
              return { Component: CandidatePage };
            },
          },
          {
            path: 'ops',
            lazy: async () => {
              const { OpsPage } = await import('@/features/ops/ops-page');
              return { Component: OpsPage };
            },
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

/** The app's router. */
export function createRouter() {
  return createBrowserRouter(routes);
}
