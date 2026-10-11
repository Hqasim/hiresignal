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

  it.each([
    'resume',
    'redactedResume',
    'prompt',
    'system',
    'content',
    'contents',
    'question',
    'Question',
    'answer',
    'ANSWER',
    'text',
    'quote',
    'rationale',
    'summary',
    'output',
    'apiKey',
    'APIKEY',
    'password',
    'secret',
    'authorization',
    'cookie',
    'token',
  ])('never writes a field named %s, whatever its value', (key) => {
    const { logger, lines } = setup();

    logger.info('ask.answered', { requestId: 'r-1', [key]: 'Who knows Go? sk-secret' });

    expect(lines[0]).not.toContain('Who knows Go?');
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      level: 'info',
      time: '2026-10-08T12:00:00.000Z',
      event: 'ask.answered',
      requestId: 'r-1',
    });
  });

  it('keeps counts and hashes whose names only contain a dropped word', () => {
    const { logger, lines } = setup();
    const fields = { inputTokens: 900, cachedTokens: 512, questionLength: 42, contentHash: 'ab12' };

    logger.info('llm.call', fields);

    expect(JSON.parse(lines[0] ?? '')).toMatchObject(fields);
  });

  it('drops content fields from error entries too, but keeps the error itself', () => {
    const { logger, lines } = setup();

    logger.error('ask.failed', new Error('timeout'), { requestId: 'r-2', prompt: 'You are…' });

    const entry = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(entry).not.toHaveProperty('prompt');
    expect(entry).toMatchObject({ requestId: 'r-2', errorMessage: 'timeout' });
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
