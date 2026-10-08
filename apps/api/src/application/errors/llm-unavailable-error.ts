import { AppError } from './app-error';

/** The model provider failed transiently on every attempt, including the fallback tier (SPEC §9.1). */
export class LlmUnavailableError extends AppError {
  override readonly code = 'LLM_UNAVAILABLE';
  override readonly httpStatus = 503;
  override readonly title = 'Model Unavailable';
}
