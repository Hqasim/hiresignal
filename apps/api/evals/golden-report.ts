import { recallAtK, type RetrievalSummary, summarizeRetrieval } from './retrieval-metrics';

/** The keyword-match modes the report compares (ADR 0008). */
export const KEYWORD_MODES = ['all', 'any', 'off'] as const;
/** One of {@link KEYWORD_MODES}. */
export type KeywordMode = (typeof KEYWORD_MODES)[number];

/** One golden question's run, reduced to ids and numbers: no question or answer text. */
export interface GoldenRun {
  id: string;
  /** Expected aliases; empty for an out-of-scope question. */
  expected: readonly string[];
  /** The alias of each retrieved chunk, best first, for each keyword-match mode. */
  ranked: Readonly<Record<KeywordMode, readonly string[]>>;
  /** Best cosine similarity with the configured mode, or `null` when nothing was retrieved. */
  bestSimilarity: number | null;
  /** Distinct candidates among the configured mode's chunks: the routing policy's candidate count. */
  candidates: number;
  /** How the ask ended, or `null` for a retrieval-only run. */
  answer: {
    outcome: string;
    routedReason: string | null;
    citations: number;
    invalidCitations: number;
  } | null;
}

/** What the report measures against. */
export interface GoldenReportSettings {
  /** The k of recall@k (5, SPEC §14). */
  k: number;
  /** `ASK_KEYWORD_MATCH`: the mode ask uses, marked in the table. */
  keywordMatch: KeywordMode;
  /** `SIMILARITY_FLOOR`. */
  similarityFloor: number;
}

/** Where the similarity floor sits between the answerable and the out-of-scope questions. */
export interface FloorCheck {
  /** Lowest best similarity of an answerable question. */
  answerableMin: number | null;
  /** Highest best similarity of an out-of-scope question. */
  outOfScopeMax: number | null;
  /** Answerable questions the floor would answer without a model (misses). */
  answerableBelowFloor: string[];
  /** Out-of-scope questions the floor lets through to the model. */
  outOfScopeAtOrAboveFloor: string[];
}

/** Retrieval quality per mode, plus the floor check. */
export interface GoldenSummary {
  byMode: Record<KeywordMode, RetrievalSummary>;
  floor: FloorCheck;
}

/**
 * Scores the runs: recall@k and MRR for each keyword-match mode, and how the similarity floor
 * splits answerable from out-of-scope questions.
 *
 * @example
 * summarizeGoldenRuns(runs, { k: 5, keywordMatch: 'any', similarityFloor: 0.55 }).byMode.any.recall;
 */
export function summarizeGoldenRuns(
  runs: readonly GoldenRun[],
  settings: GoldenReportSettings,
): GoldenSummary {
  const byMode = Object.fromEntries(
    KEYWORD_MODES.map((mode) => [
      mode,
      summarizeRetrieval(
        runs.map((run) => ({ expected: run.expected, ranked: run.ranked[mode] })),
        settings.k,
      ),
    ]),
  ) as Record<KeywordMode, RetrievalSummary>;
  const answerable = runs.filter((run) => run.expected.length > 0);
  const outOfScope = runs.filter((run) => run.expected.length === 0);
  const similarities = (group: readonly GoldenRun[]) =>
    group.flatMap((run) => (run.bestSimilarity === null ? [] : [run.bestSimilarity]));
  const below = (run: GoldenRun) =>
    run.bestSimilarity === null || run.bestSimilarity < settings.similarityFloor;
  return {
    byMode,
    floor: {
      answerableMin: minOrNull(similarities(answerable)),
      outOfScopeMax: maxOrNull(similarities(outOfScope)),
      answerableBelowFloor: answerable.filter(below).map((run) => run.id),
      outOfScopeAtOrAboveFloor: outOfScope.filter((run) => !below(run)).map((run) => run.id),
    },
  };
}

const HEADERS = [
  'ID',
  'Expected',
  'Top 5',
  'Hit',
  'Best sim',
  'Cands',
  'Outcome',
  'Route',
  'Cites',
];
const NONE = '–';

/**
 * Renders the golden-question report for `npm run ask:golden`: one row per question, then
 * recall@k and MRR per keyword-match mode, then the floor check. Ids, aliases and numbers only.
 *
 * @example
 * formatGoldenReport(runs, { k: 5, keywordMatch: 'any', similarityFloor: 0.55 });
 * // ID   Expected     Top 5                Hit  Best sim  Cands  Outcome   Route    Cites
 * // Q01  C01 C05 C10  C01 C10 C05 C01 C02  3/3  0.712     6      answered  default  3 (0 bad)
 */
export function formatGoldenReport(
  runs: readonly GoldenRun[],
  settings: GoldenReportSettings,
): string {
  const rows = [HEADERS, ...runs.map((run) => toRow(run, settings))];
  const summary = summarizeGoldenRuns(runs, settings);
  const modes = [
    ['Keyword match', `recall@${String(settings.k)}`, 'MRR', 'Questions'],
    ...KEYWORD_MODES.map((mode) => [
      mode === settings.keywordMatch ? `${mode} (ask)` : mode,
      summary.byMode[mode].recall.toFixed(3),
      summary.byMode[mode].mrr.toFixed(3),
      String(summary.byMode[mode].questions),
    ]),
  ];
  const { floor } = summary;
  return [
    table(rows),
    '',
    table(modes),
    '',
    `Similarity floor ${settings.similarityFloor.toFixed(2)}: lowest answerable ${similarity(floor.answerableMin)}, highest out of scope ${similarity(floor.outOfScopeMax)}`,
    `  answerable below the floor: ${list(floor.answerableBelowFloor)}`,
    `  out of scope at or above the floor: ${list(floor.outOfScopeAtOrAboveFloor)}`,
  ].join('\n');
}

function toRow(run: GoldenRun, settings: GoldenReportSettings): string[] {
  const ranked = run.ranked[settings.keywordMatch];
  const hit =
    run.expected.length === 0
      ? NONE
      : `${String(Math.round(recallAtK({ expected: run.expected, ranked }, settings.k) * run.expected.length))}/${String(run.expected.length)}`;
  return [
    run.id,
    run.expected.length === 0 ? NONE : run.expected.join(' '),
    ranked.slice(0, settings.k).join(' ') || NONE,
    hit,
    similarity(run.bestSimilarity),
    String(run.candidates),
    run.answer?.outcome ?? NONE,
    run.answer?.routedReason ?? NONE,
    run.answer === null
      ? NONE
      : `${String(run.answer.citations)} (${String(run.answer.invalidCitations)} bad)`,
  ];
}

function table(rows: readonly (readonly string[])[]): string {
  const widths = (rows[0] ?? []).map((_, column) =>
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

function similarity(value: number | null): string {
  return value === null ? NONE : value.toFixed(3);
}

function list(ids: readonly string[]): string {
  return ids.length === 0 ? 'none' : ids.join(', ');
}

function minOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.min(...values);
}

function maxOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}
