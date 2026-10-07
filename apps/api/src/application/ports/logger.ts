/**
 * Values a log entry may carry. Deliberately scalar: log ids, counts, hashes, durations and
 * statuses, never resume text, prompts, model output, user questions or secrets (CLAUDE.md rule 4).
 */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

/**
 * Structured logger. Each entry is one event name plus scalar fields; adapters decide the
 * output format (JSON lines on Lambda and locally).
 */
export interface Logger {
  /** Records a normal event, for example `server.listening`. */
  info(event: string, fields?: LogFields): void;
  /** Records a failure. `error` is serialized as name, message and stack; it is never sent to clients. */
  error(event: string, error: unknown, fields?: LogFields): void;
}
