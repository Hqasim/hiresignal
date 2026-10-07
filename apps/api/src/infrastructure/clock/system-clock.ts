import type { Clock } from '../../application/ports/clock';

/** {@link Clock} backed by the system time. */
export const systemClock: Clock = { now: () => new Date() };
