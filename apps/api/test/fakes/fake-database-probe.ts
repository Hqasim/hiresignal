import type { DatabaseProbe } from '../../src/application/ports/database-probe';

/** {@link DatabaseProbe} fake: answers, or fails with `failure` when one is set. */
export class FakeDatabaseProbe implements DatabaseProbe {
  failure: Error | null = null;
  pings = 0;

  ping(): Promise<void> {
    this.pings += 1;
    return this.failure === null ? Promise.resolve() : Promise.reject(this.failure);
  }
}
