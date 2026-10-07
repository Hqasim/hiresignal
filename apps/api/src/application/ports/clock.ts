/** Source of the current time. Injected everywhere, so tests control time and never sleep. */
export interface Clock {
  /** Returns the current instant. */
  now(): Date;
}
