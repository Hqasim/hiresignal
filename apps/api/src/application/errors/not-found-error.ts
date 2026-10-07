import { AppError } from './app-error';

/** The requested resource or route does not exist. */
export class NotFoundError extends AppError {
  override readonly code = 'NOT_FOUND';
  override readonly httpStatus = 404;
  override readonly title = 'Not Found';
}
