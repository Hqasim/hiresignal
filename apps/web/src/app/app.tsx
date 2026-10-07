import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';

import { createQueryClient } from './query-client';
import { createRouter } from './router';

/** Root component: providers plus the router. */
export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
