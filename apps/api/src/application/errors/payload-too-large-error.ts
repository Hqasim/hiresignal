import { AppError } from './app-error';

/**
 * The request body is larger than the API accepts (SPEC §10: 16 KB). Raised by the body-limit
 * middleware before any route reads the body, so an oversized payload costs no parsing (LLM10).
 */
export class PayloadTooLargeError extends AppError {
  override readonly code = 'PAYLOAD_TOO_LARGE';
  override readonly httpStatus = 413;
  override readonly title = 'Payload Too Large';
}
