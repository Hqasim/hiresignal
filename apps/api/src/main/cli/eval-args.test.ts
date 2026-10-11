import { describe, expect, it } from 'vitest';

import { parseEvalArgs } from './eval-args';

describe('parseEvalArgs', () => {
  it('replays without writing by default', () => {
    expect(parseEvalArgs([])).toEqual({ mode: 'replay', write: false });
  });

  it.each([
    [['--write'], { mode: 'replay', write: true }],
    [['--mode', 'record'], { mode: 'record', write: false }],
    [['--mode=record', '--write'], { mode: 'record', write: true }],
  ])('parses %j', (argv, expected) => {
    expect(parseEvalArgs(argv)).toEqual(expected);
  });

  it('rejects live mode: evals replay fixtures, and record fills only the missing ones', () => {
    expect(() => parseEvalArgs(['--mode', 'live'])).toThrow('--mode');
  });

  it.each([[['--reset']], [['extra']]])('rejects the unknown argument %j', (argv) => {
    expect(() => parseEvalArgs(argv)).toThrow();
  });
});
