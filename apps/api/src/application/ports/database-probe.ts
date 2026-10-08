/** Checks that the database answers. Used by `GET /api/health`, which also warms Neon. */
export interface DatabaseProbe {
  /**
   * Resolves when the database answers a trivial query.
   *
   * @throws whatever the driver raised (connection refused, timeout, authentication failure).
   */
  ping(): Promise<void>;
}
