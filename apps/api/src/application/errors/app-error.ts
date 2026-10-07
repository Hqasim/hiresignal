/** HTTP statuses an {@link AppError} may map to. */
export type AppErrorStatus = 400 | 404 | 413 | 422 | 429 | 500 | 502 | 503;

/**
 * Base class for every error the application raises on purpose (SPEC §7.4).
 *
 * Each subclass has a stable `code` that clients can branch on, plus the HTTP status and title
 * the error middleware renders as RFC 9457 problem+json. `detail` must be safe to show to a user:
 * never put resume text, prompts, model output or secrets in it.
 */
export abstract class AppError extends Error {
  /** Stable, machine-readable identifier, for example `NOT_FOUND`. */
  abstract readonly code: string;
  /** HTTP status the error maps to. */
  abstract readonly httpStatus: AppErrorStatus;
  /** Short, human-readable summary of the problem type. */
  abstract readonly title: string;
  /** Explanation specific to this occurrence, safe to show to a user. */
  readonly detail: string;

  constructor(detail: string, options?: ErrorOptions) {
    super(detail, options);
    this.name = new.target.name;
    this.detail = detail;
  }
}
