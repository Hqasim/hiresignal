import { AppError } from './app-error';

/**
 * An ask question carries a high-severity injection signal: Unicode tag characters, or an
 * instruction hidden in markup (SPEC §9.7 step 1, §9.4). It is refused before anything is
 * embedded or sent to a model. The detail names the signals, never the question text.
 */
export class InjectionRejectedError extends AppError {
  override readonly code = 'INJECTION_REJECTED';
  override readonly httpStatus = 422;
  override readonly title = 'Question Rejected';
}
