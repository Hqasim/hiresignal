import { describe, expect, it } from 'vitest';

import { nextUtcMidnight, startOfUtcDay } from './utc-day';

describe('UTC day boundaries', () => {
  it.each([
    [
      'mid-afternoon',
      '2026-10-09T15:42:07.123Z',
      '2026-10-09T00:00:00.000Z',
      '2026-10-10T00:00:00.000Z',
    ],
    [
      'exactly midnight',
      '2026-10-09T00:00:00.000Z',
      '2026-10-09T00:00:00.000Z',
      '2026-10-10T00:00:00.000Z',
    ],
    [
      'the last millisecond of a day',
      '2026-10-09T23:59:59.999Z',
      '2026-10-09T00:00:00.000Z',
      '2026-10-10T00:00:00.000Z',
    ],
    [
      'the end of a month',
      '2026-10-31T18:00:00.000Z',
      '2026-10-31T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
    ],
    [
      'the end of a year',
      '2026-12-31T23:00:00.000Z',
      '2026-12-31T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
    ],
    [
      'a leap day',
      '2028-02-29T12:00:00.000Z',
      '2028-02-29T00:00:00.000Z',
      '2028-03-01T00:00:00.000Z',
    ],
  ])('finds the day around %s', (_label, now, start, next) => {
    expect(startOfUtcDay(new Date(now)).toISOString()).toBe(start);
    expect(nextUtcMidnight(new Date(now)).toISOString()).toBe(next);
  });
});
