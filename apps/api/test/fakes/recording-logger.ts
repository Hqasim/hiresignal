import type { LogFields, Logger } from '../../src/application/ports/logger';

/** One captured log call. */
export interface LogEntry {
  level: 'info' | 'error';
  event: string;
  error?: unknown;
  fields?: LogFields;
}

/** {@link Logger} fake that records entries so tests can assert what was (and wasn't) logged. */
export class RecordingLogger implements Logger {
  readonly entries: LogEntry[] = [];

  info(event: string, fields?: LogFields): void {
    this.entries.push({ level: 'info', event, ...(fields && { fields }) });
  }

  error(event: string, error: unknown, fields?: LogFields): void {
    this.entries.push({ level: 'error', event, error, ...(fields && { fields }) });
  }
}
