import type { Rating } from '../../domain/scoring/scorecard';
import { countCitations, type PoolScreening } from './screen-pool';

const HEADERS = ['#', 'Alias', 'Score', 'Must-haves', 'Ratings (S/P/N/U)', 'Citations', 'Notes'];
const NONE = '–';
const RATING_ORDER: readonly Rating[] = ['strong', 'partial', 'none', 'unclear'];

/**
 * Renders the seeded ranking as a plain-text table for the seed CLI: highest score first, ties by
 * alias, quarantined candidates last and unscored. Scores and counts only, never text.
 *
 * @example
 * formatRankingTable(screenings);
 * // #  Alias  Score  Must-haves  Ratings (S/P/N/U)  Citations  Notes
 * // 1  C01    92     4/4         6/1/0/0            9          –
 */
export function formatRankingTable(screenings: readonly PoolScreening[]): string {
  const ranked = [...screenings].sort(
    (a, b) => scoreOf(b) - scoreOf(a) || a.alias.localeCompare(b.alias),
  );
  const rows = [HEADERS, ...ranked.map((screening, index) => toRow(screening, index + 1))];
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

/** Quarantined candidates have no score; −1 sorts them after every scored one. */
function scoreOf(screening: PoolScreening): number {
  return screening.status === 'quarantined' ? -1 : screening.scorecard.score;
}

function toRow(screening: PoolScreening, rank: number): string[] {
  if (screening.status === 'quarantined') {
    return [String(rank), screening.alias, NONE, NONE, NONE, NONE, 'quarantined'];
  }
  const { scorecard } = screening;
  const counts = RATING_ORDER.map(
    (rating) =>
      scorecard.result.requirements.filter((requirement) => requirement.rating === rating).length,
  );
  return [
    String(rank),
    screening.alias,
    String(scorecard.score),
    `${String(scorecard.mustHavesMet)}/${String(scorecard.mustHavesTotal)}`,
    counts.join('/'),
    String(countCitations(scorecard)),
    notes(screening),
  ];
}

function notes(screening: Exclude<PoolScreening, { status: 'quarantined' }>): string {
  if (screening.status === 'already-screened') {
    return 'stored';
  }
  const parts = [
    ...(screening.repairAttempted ? ['repaired'] : []),
    ...(screening.downgraded > 0 ? [`${String(screening.downgraded)} downgraded`] : []),
  ];
  return parts.length === 0 ? NONE : parts.join(', ');
}
