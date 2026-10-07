import { describe, expect, it } from 'vitest';

import { createJsonConsoleLogger } from './json-console-logger';

function setup() {
  const lines: string[] = [];
  const logger = createJsonConsoleLogger({
    clock: { now: () => new Date('2026-10-08T12:00:00.000Z') },
    sink: (line) => lines.push(line),
  });
  return { logger, lines };
}

describe('createJsonConsoleLogger', () => {
  it('writes one JSON line per event with level, time and fields', () => {
    const { logger, lines } = setup();

    logger.info('server.listening', { port: 3000 });

    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { level: 'info', time: '2026-10-08T12:00:00.000Z', event: 'server.listening', port: 3000 },
    ]);
  });

  it('serializes an Error as name, message and stack', () => {
    const { logger, lines } = setup();

    logger.error('http.unhandled_error', new TypeError('boom'), { requestId: 'r-1' });

    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'error',
      event: 'http.unhandled_error',
      requestId: 'r-1',
      errorName: 'TypeError',
      errorMessage: 'boom',
      stack: expect.stringContaining('TypeError: boom') as unknown,
    });
  });

  it('records thrown non-Error values without a stack', () => {
    const { logger, lines } = setup();

    logger.error('job.failed', 'plain string');

    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      errorName: 'NonError',
      errorMessage: 'plain string',
      stack: null,
    });
  });
});
