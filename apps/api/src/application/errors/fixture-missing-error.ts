import type { EmbeddingTask, LlmTask } from '../../domain/routing/llm-task';
import { AppError } from './app-error';

/**
 * Replay mode found no recorded response for a request (SPEC §9.8). Usually a prompt, schema or
 * model ID changed without re-recording. The message names the command that records it.
 */
export class FixtureMissingError extends AppError {
  override readonly code = 'FIXTURE_MISSING';
  override readonly httpStatus = 500;
  override readonly title = 'Recorded Response Missing';

  constructor(task: LlmTask | EmbeddingTask) {
    super(
      `No recorded response for ${task}. Run \`${recordCommandFor(task)}\` (needs GEMINI_API_KEY).`,
    );
  }
}

function recordCommandFor(task: LlmTask | EmbeddingTask): string {
  return task === 'platform.smoke' ? 'npm run llm:smoke' : 'npm run seed:record';
}
