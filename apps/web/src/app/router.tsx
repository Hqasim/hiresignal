import { createBrowserRouter } from 'react-router';

import { Layout } from './layout';

/** Route table. Each page is a lazy chunk, so the first load ships only the shell (SPEC §11). */
export function createRouter() {
  return createBrowserRouter([
    {
      element: <Layout />,
      children: [
        {
          index: true,
          lazy: async () => {
            const { HomePage } = await import('@/features/health/home-page');
            return { Component: HomePage };
          },
        },
      ],
    },
  ]);
}
