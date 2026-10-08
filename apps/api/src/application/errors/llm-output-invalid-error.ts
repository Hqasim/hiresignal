import { AppError } from './app-error';

/** The model's reply didn't match the expected schema, even after one repair attempt. */
export class LlmOutputInvalidError extends AppError {
  override readonly code = 'LLM_OUTPUT_INVALID';
  override readonly httpStatus = 502;
  override readonly title = 'Invalid Model Output';
}
