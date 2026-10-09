import type { IngestOutcome } from './ingest-resume';

const HEADERS = ['Alias', 'Status', 'Stored', 'Signals', 'Dismissed', 'Classifier', 'Chunks'];
const NONE = '–';

/**
 * Renders seeding outcomes as a plain-text table for the seed CLI's final report: ids, statuses
 * and counts, never resume text.
 *
 * @example
 * formatOutcomeTable(outcomes);
 * // Alias  Status       Stored   Signals                    Dismissed      Classifier       Chunks
 * // C06    quarantined  created  L1.html-comment, …         –              –                0
 */
export function formatOutcomeTable(outcomes: readonly IngestOutcome[]): string {
  const rows = [HEADERS, ...outcomes.map(toRow)];
  const widths = HEADERS.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? '').length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

function toRow(outcome: IngestOutcome): string[] {
  return [
    outcome.alias,
    outcome.guardStatus,
    outcome.created ? 'created' : 'skipped',
    list(outcome.signalIds),
    list(outcome.dismissedIds),
    outcome.classifier === null
      ? NONE
      : `${outcome.classifier.verdict} ${outcome.classifier.confidence.toFixed(2)}`,
    outcome.chunkCount === null ? NONE : String(outcome.chunkCount),
  ];
}

/** Distinct ids in first-seen order, so C06's repeated L2 hits read as one line. */
function list(ids: readonly string[]): string {
  return ids.length === 0 ? NONE : [...new Set(ids)].join(', ');
}
