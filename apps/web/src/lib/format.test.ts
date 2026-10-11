import { describe, expect, it } from 'vitest';

import {
  formatCount,
  formatMs,
  formatPercent,
  formatUtcDateTime,
  formatUtcTime,
  formatWait,
  NO_VALUE,
} from './format';

describe('format', () => {
  it('groups whole numbers', () => {
    expect(formatCount(170447)).toBe('170,447');
    expect(formatCount(0)).toBe('0');
  });

  it.each<[number | null, string]>([
    [0.375, '37.5%'],
    [0.55, '55%'],
    [0, '0%'],
    [1, '100%'],
    [null, NO_VALUE],
  ])('formats the ratio %s as %s', (ratio, expected) => {
    expect(formatPercent(ratio)).toBe(expected);
  });

  it.each<[number | null, string]>([
    [774.6, '775 ms'],
    [1310, '1,310 ms'],
    [0, '0 ms'],
    [null, NO_VALUE],
  ])('formats %s milliseconds as %s', (ms, expected) => {
    expect(formatMs(ms)).toBe(expected);
  });

  it('shows timestamps in UTC to the minute, whatever the offset they arrive with', () => {
    expect(formatUtcDateTime('2026-10-11T14:05:59.999Z')).toBe('2026-10-11 14:05 UTC');
    expect(formatUtcDateTime('2026-10-11T23:30:00-02:00')).toBe('2026-10-12 01:30 UTC');
    expect(formatUtcTime('2026-10-12T00:00:00.000Z')).toBe('00:00 UTC');
  });

  it.each<[number, string]>([
    [0, '1 min'],
    [30, '1 min'],
    [61, '2 min'],
    [3600, '1 h'],
    [4000, '1 h 7 min'],
    [86399, '24 h'],
  ])('formats a wait of %d seconds as %s', (seconds, expected) => {
    expect(formatWait(seconds)).toBe(expected);
  });
});
