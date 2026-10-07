import type { Clock } from '../../application/ports/clock';
import type { LogFields, Logger } from '../../application/ports/logger';

/** Where log lines go. Defaults to stdout, which Lambda forwards to CloudWatch. */
export type LogSink = (line: string) => void;

/**
 * {@link Logger} that writes one JSON object per line, which CloudWatch Logs Insights and
 * local tools can query without a parser.
 *
 * Phase 7 adds a serializer that also drops sensitive keys (SPEC §17).
 *
 * @example
 * createJsonConsoleLogger({ clock: systemClock }).info('server.listening', { port: 3000 });
 * // {"level":"info","time":"2026-10-08T00:00:00.000Z","event":"server.listening","port":3000}
 */
export function createJsonConsoleLogger(deps: { clock: Clock; sink?: LogSink }): Logger {
  const sink = deps.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const write = (level: 'info' | 'error', event: string, fields: LogFields = {}): void => {
    sink(JSON.stringify({ level, time: deps.clock.now().toISOString(), event, ...fields }));
  };

  return {
    info: (event, fields) => {
      write('info', event, fields);
    },
    error: (event, error, fields) => {
      write('error', event, { ...fields, ...serializeError(error) });
    },
  };
}

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack ?? null };
  }
  return { errorName: 'NonError', errorMessage: String(error), stack: null };
}
