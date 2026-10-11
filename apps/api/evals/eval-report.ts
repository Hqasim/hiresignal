// Renders `npm run eval` results as Markdown: printed to the console, appended to the GitHub
// Actions job summary, and written between the markers of docs/evals.md with `--write`
// (SPEC §14). Ids, labels and numbers only. Tables are padded the way Prettier formats them, so a
// written docs/evals.md passes `npm run format:check` unchanged.

import type { EvalResults, GateResult } from './gates';
import { KEYWORD_MODES, type KeywordMode } from './golden-report';
import {
  INJECTION_ARMS,
  type InjectionArm,
  type InjectionMiss,
  type InjectionSummary,
} from './injection-suite';
import type { PiiSummary } from './pii-suite';
import type { RetrievalSuiteSummary } from './retrieval-suite';
import { SCORECARD_CHECKS, type ScorecardCheck, type ScorecardSummary } from './scorecard-suite';

/** Opens the generated block of docs/evals.md. */
export const GENERATED_START = '<!-- eval-results:start -->';
/** Closes the generated block of docs/evals.md. */
export const GENERATED_END = '<!-- eval-results:end -->';

/** What the report says about the run itself. */
export interface EvalReportMeta {
  /** `YYYY-MM-DD`, the day of the run (UTC). */
  date: string;
  mode: 'replay' | 'record';
}

const NONE = '–';
/** Prettier pads every table column to at least the width of `---`. */
const MIN_COLUMN_WIDTH = 3;

/**
 * Renders the full report: a dated verdict, the gates, then one section per suite with its
 * ablation table.
 *
 * @example
 * process.stdout.write(renderEvalReport(results, checkGates(results), { date: '2026-10-12', mode: 'replay' }));
 */
export function renderEvalReport(
  results: EvalResults,
  gates: readonly GateResult[],
  meta: EvalReportMeta,
): string {
  const failed = gates.filter((gate) => !gate.passed).length;
  const verdict =
    failed === 0
      ? `all ${String(gates.length)} gates pass`
      : `${String(failed)} of ${String(gates.length)} gates fail`;
  return [
    `As of ${meta.date} (UTC): \`npm run eval\` in ${meta.mode} mode, ${verdict}.`,
    '',
    '### Gates',
    '',
    gatesTable(gates),
    '',
    '### Retrieval',
    '',
    ...retrievalSection(results.retrieval),
    '',
    '### Injection',
    '',
    ...injectionSection(results.injection),
    '',
    '### PII',
    '',
    ...piiSection(results.pii),
    '',
    '### Scorecards',
    '',
    ...scorecardSection(results.scorecards),
  ].join('\n');
}

/**
 * Replaces everything between {@link GENERATED_START} and {@link GENERATED_END} with `block`,
 * leaving the hand-written rest of the document as it is.
 *
 * @throws Error if either marker is missing, or they are out of order.
 *
 * @example
 * replaceGeneratedBlock(await readFile('docs/evals.md', 'utf8'), report);
 */
export function replaceGeneratedBlock(document: string, block: string): string {
  const start = document.indexOf(GENERATED_START);
  const end = document.indexOf(GENERATED_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Expected ${GENERATED_START} … ${GENERATED_END} in the document`);
  }
  return `${document.slice(0, start + GENERATED_START.length)}\n\n${block.trim()}\n\n${document.slice(end)}`;
}

/**
 * Formats rows as a Markdown table the way Prettier does: every cell padded to its column's
 * width (at least 3), and a `---` delimiter row after the header.
 *
 * @example
 * markdownTable([['Arm', 'Recall'], ['Rules only', '0.900']]);
 * // | Arm        | Recall |
 * // | ---------- | ------ |
 * // | Rules only | 0.900  |
 */
export function markdownTable(rows: readonly (readonly string[])[]): string {
  const [header, ...body] = rows;
  if (header === undefined) {
    return '';
  }
  const widths = header.map((_, column) =>
    Math.max(MIN_COLUMN_WIDTH, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]) =>
    `| ${widths.map((width, column) => (cells[column] ?? '').padEnd(width)).join(' | ')} |`;
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...body.map(line)].join(
    '\n',
  );
}

function gatesTable(gates: readonly GateResult[]): string {
  return markdownTable([
    ['Suite', 'Metric', 'Value', 'Gate', 'Result'],
    ...gates.map((gate) => [
      gate.suite,
      gate.metric,
      gate.unit === 'count' ? count(gate.value) : rate(gate.value),
      `${gate.comparison === 'atLeast' ? '≥' : '≤'} ${gate.unit === 'count' ? String(gate.threshold) : rate(gate.threshold)}`,
      gate.passed ? 'pass' : 'FAIL',
    ]),
  ]);
}

const MODE_LABELS: Readonly<Record<KeywordMode, string>> = {
  all: '`all` (every keyword)',
  any: '`any` (any keyword)',
  off: '`off` (vector only)',
};

function retrievalSection(retrieval: RetrievalSuiteSummary): string[] {
  const k = String(retrieval.k);
  const { floor, answers } = retrieval;
  const lines = [
    `recall@${k} and MRR over the ${String(retrieval.byMode[retrieval.askMode].questions)} answerable golden questions (\`data/evals/retrieval.jsonl\`), for each keyword-match mode of the hybrid search (ADR 0008). Ask uses \`${retrieval.askMode}\`; \`off\` is the vector-only ablation.`,
    '',
    markdownTable([
      ['Keyword match', `recall@${k}`, 'MRR'],
      ...KEYWORD_MODES.map((mode) => [
        mode === retrieval.askMode ? `${MODE_LABELS[mode]}, ask` : MODE_LABELS[mode],
        rate(retrieval.byMode[mode].recall),
        rate(retrieval.byMode[mode].mrr),
      ]),
    ]),
    '',
    `- Similarity floor ${retrieval.similarityFloor.toFixed(2)}: lowest answerable ${rate(floor.answerableMin)}, highest out of scope ${rate(floor.outOfScopeMax)}. Answerable below the floor: ${list(floor.answerableBelowFloor)}. Out of scope at or above it: ${list(floor.outOfScopeAtOrAboveFloor)}.`,
  ];
  if (answers !== null) {
    lines.push(
      `- Answers: ${String(answers.answered)} of ${String(answers.answerable)} answerable questions answered with verified citations (${String(answers.citations)} citations, ${String(answers.invalidCitations)} dropped). ${String(answers.declined)} of ${String(answers.outOfScope)} out-of-scope questions came back as insufficient evidence.`,
    );
  }
  return lines;
}

const ARM_LABELS: Readonly<Record<InjectionArm, string>> = {
  rules: 'Rules only (L0–L2)',
  rulesAndClassifier: 'Rules + classifier (L0–L3)',
};

function injectionSection(injection: InjectionSummary): string[] {
  const { malicious, benign } = injection.items;
  return [
    `${String(malicious)} malicious items and ${String(benign)} benign hard negatives (\`data/evals/injection.jsonl\`). An item counts as detected when the guard flags or quarantines it (ADR 0023).`,
    '',
    markdownTable([
      [
        'Arm',
        'Malicious detected',
        'Recall',
        'Precision',
        'F1',
        'Benign flagged',
        'False-positive rate',
        'Quarantined (malicious, benign)',
      ],
      ...INJECTION_ARMS.map((arm) => {
        const summary = injection.byArm[arm];
        return [
          ARM_LABELS[arm],
          `${String(summary.truePositives)}/${String(malicious)}`,
          rate(summary.recall),
          rate(summary.precision),
          rate(summary.f1),
          `${String(summary.falsePositives)}/${String(benign)}`,
          rate(summary.falsePositiveRate),
          `${String(summary.quarantined.malicious)}, ${String(summary.quarantined.benign)}`,
        ];
      }),
    ]),
    '',
    ...INJECTION_ARMS.map(
      (arm) =>
        `- ${ARM_LABELS[arm]} missed: ${misses(injection.byArm[arm].missed)}. Flagged benign: ${misses(injection.byArm[arm].falseAlarms)}.`,
    ),
  ];
}

function piiSection(pii: PiiSummary): string[] {
  return [
    `${String(pii.entities)} labelled entities in ${String(pii.snippets)} snippets (\`data/evals/pii.jsonl\`), plus the header names of the ${String(pii.resumes)} seeded resumes.`,
    '',
    markdownTable([
      ['Type', 'Labelled', 'Redacted', 'Recall'],
      ...pii.byType.map((row) => [
        `\`${row.type}\``,
        String(row.labelled),
        String(row.redacted),
        rate(row.recall),
      ]),
    ]),
    '',
    `- Leaks: ${String(pii.entityLeaks)} labelled values (${list(pii.leakedSnippets)}) and ${String(pii.nameLeaks)} name words (${list(pii.leakedResumes)}).`,
  ];
}

const CHECK_LABELS: Readonly<Record<ScorecardCheck, [string, string]>> = {
  coverage: [
    'Coverage',
    'a scorecard for each non-quarantined candidate, none for a quarantined one',
  ],
  schema: ['Schema', 'the result parses and rates each requirement exactly once'],
  citations: ['Citations', 'each quote re-verifies against its chunk, at its stored span'],
  evidence: ['Evidence', 'each strong or partial rating has a valid citation'],
  scores: ['Scores', 'the stored score and must-haves recompute from the ratings'],
};

function scorecardSection(scorecards: ScorecardSummary): string[] {
  const failures = scorecards.failures.map((failure) => `${failure.alias} (${failure.check})`);
  return [
    `Every seeded candidate's stored scorecard, re-checked with the code that produced it (ADR 0012): ${String(scorecards.candidates)} candidates.`,
    '',
    markdownTable([
      ['Check', 'What it checks', 'Passed', 'Rate'],
      ...SCORECARD_CHECKS.map((check) => [
        CHECK_LABELS[check][0],
        CHECK_LABELS[check][1],
        `${String(scorecards[check].passed)}/${String(scorecards[check].total)}`,
        rate(scorecards[check].rate),
      ]),
    ]),
    '',
    `- Failures: ${list(failures)}.`,
  ];
}

function rate(value: number | null): string {
  return value === null ? NONE : value.toFixed(3);
}

function count(value: number | null): string {
  return value === null ? NONE : String(value);
}

function list(items: readonly string[]): string {
  return items.length === 0 ? 'none' : items.join(', ');
}

function misses(items: readonly InjectionMiss[]): string {
  return list(items.map((item) => `${item.id} (${item.category})`));
}
