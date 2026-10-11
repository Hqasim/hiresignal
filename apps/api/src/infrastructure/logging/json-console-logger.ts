import type { Clock } from '../../application/ports/clock';
import type { LogFields, Logger } from '../../application/ports/logger';

/** Where log lines go. Defaults to stdout, which Lambda forwards to CloudWatch. */
export type LogSink = (line: string) => void;

/**
 * Field names that are never written, whatever their value (SPEC §17, CLAUDE.md rule 4). The
 * `LogFields` type already keeps values scalar; this is the second line of defence against a
 * call site that names a field after content (`question`, `answer`, `prompt`, …) or a secret.
 *
 * Keys are compared case-insensitively and in full, so `inputTokens`, `contentHash` and
 * `questionLength` (counts and hashes) are still logged.
 */
const DROPPED_KEYS: ReadonlySet<string> = new Set(
  [
    // Content: resume text, prompts, model output and user questions.
    'resume',
    'redactedResume',
    'prompt',
    'system',
    'content',
    'contents',
    'question',
    'answer',
    'text',
    'quote',
    'rationale',
    'summary',
    'output',
    // Secrets.
    'apiKey',
    'password',
    'secret',
    'authorization',
    'cookie',
    'token',
  ].map((key) => key.toLowerCase()),
);

/**
 * {@link Logger} that writes one JSON object per line, which CloudWatch Logs Insights and
 * local tools can query without a parser. Fields named like content or secrets are dropped
 * (see {@link DROPPED_KEYS}).
 *
 * @example
 * createJsonConsoleLogger({ clock: systemClock }).info('server.listening', { port: 3000 });
 * // {"level":"info","time":"2026-10-08T00:00:00.000Z","event":"server.listening","port":3000}
 */
export function createJsonConsoleLogger(deps: { clock: Clock; sink?: LogSink }): Logger {
  const sink = deps.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const write = (level: 'info' | 'error', event: string, fields: LogFields = {}): void => {
    sink(JSON.stringify({ level, time: deps.clock.now().toISOString(), event, ...safe(fields) }));
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

/** The fields without any whose key is on the denylist. */
function safe(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => !DROPPED_KEYS.has(key.toLowerCase())),
  );
}

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack ?? null };
  }
  return { errorName: 'NonError', errorMessage: String(error), stack: null };
}
