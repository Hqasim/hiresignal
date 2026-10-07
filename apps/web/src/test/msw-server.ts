import { setupServer } from 'msw/node';

/**
 * Shared MSW server for component tests. It starts with no handlers; each test declares the
 * API behaviour it needs with `server.use(...)`, and unhandled requests fail the test.
 */
export const server = setupServer();
