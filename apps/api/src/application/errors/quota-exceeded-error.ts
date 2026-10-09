import { AppError } from './app-error';

/**
 * Today's live LLM calls reached `DAILY_LLM_CALL_CAP` (SPEC §10, LLM10). Precomputed results still
 * work; live routes are refused until the next UTC midnight.
 */
export class QuotaExceededError extends AppError {
  override readonly code = 'QUOTA_EXCEEDED';
  override readonly httpStatus = 429;
  override readonly title = 'Daily LLM Quota Exceeded';
  /** Whole seconds until the cap resets, for `Retry-After` and the problem's `retryAfter`. */
  readonly retryAfterSeconds: number;

  constructor(detail: string, retryAfterSeconds: number) {
    super(detail);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
