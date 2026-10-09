import { AppError } from './app-error';

/** A request's path, query or body failed validation against its contract. */
export class ValidationError extends AppError {
  override readonly code = 'VALIDATION_FAILED';
  override readonly httpStatus = 400;
  override readonly title = 'Invalid Request';
}
