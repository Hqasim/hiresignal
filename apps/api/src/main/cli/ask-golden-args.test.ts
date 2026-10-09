import { describe, expect, it } from 'vitest';

import { parseAskGoldenArgs } from './ask-golden-args';

describe('parseAskGoldenArgs', () => {
  it('replays the full ask by default', () => {
    expect(parseAskGoldenArgs([])).toEqual({ mode: 'replay', retrievalOnly: false });
  });

  it.each([
    [['--mode', 'record', '--retrieval-only'], { mode: 'record', retrievalOnly: true }],
    [['--mode=record'], { mode: 'record', retrievalOnly: false }],
    [['--retrieval-only'], { mode: 'replay', retrievalOnly: true }],
  ])('parses %j', (argv, expected) => {
    expect(parseAskGoldenArgs(argv)).toEqual(expected);
  });

  it('rejects live mode, which would spend quota on answers already recorded', () => {
    expect(() => parseAskGoldenArgs(['--mode', 'live'])).toThrow('--mode');
  });

  it.each([[['--reset']], [['extra']]])('rejects the unknown argument %j', (argv) => {
    expect(() => parseAskGoldenArgs(argv)).toThrow();
  });
});
