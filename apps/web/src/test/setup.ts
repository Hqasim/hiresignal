import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { server } from './msw-server';

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  // jsdom has no layout, so it has no scrollIntoView; citation chips call it.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
