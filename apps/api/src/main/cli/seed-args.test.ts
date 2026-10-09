import { describe, expect, it } from 'vitest';

import { parseSeedArgs } from './seed-args';

describe('parseSeedArgs', () => {
  it('replays without resetting by default', () => {
    expect(parseSeedArgs([])).toEqual({ mode: 'replay', reset: false });
  });

  it.each([
    [['--mode', 'record', '--reset'], { mode: 'record', reset: true }],
    [['--mode=live'], { mode: 'live', reset: false }],
    [['--reset'], { mode: 'replay', reset: true }],
  ])('parses %j', (argv, expected) => {
    expect(parseSeedArgs(argv)).toEqual(expected);
  });

  it('rejects an unknown mode, naming the flag', () => {
    expect(() => parseSeedArgs(['--mode', 'fast'])).toThrow('--mode');
  });

  it.each([[['--force']], [['extra']]])('rejects the unknown argument %j', (argv) => {
    expect(() => parseSeedArgs(argv)).toThrow();
  });
});
