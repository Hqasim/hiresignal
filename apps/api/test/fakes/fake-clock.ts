import type { Clock } from '../../src/application/ports/clock';

/** {@link Clock} fake that only moves when a test calls {@link FakeClock.advance}. */
export class FakeClock implements Clock {
  private current: number;

  constructor(start = new Date('2026-10-08T12:00:00.000Z')) {
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  /** Moves time forward by `ms` milliseconds. */
  advance(ms: number): void {
    this.current += ms;
  }
}
