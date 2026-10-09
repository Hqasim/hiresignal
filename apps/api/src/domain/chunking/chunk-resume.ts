import type { CandidateAlias } from '../candidates/candidate';
import type { ResumeChunk } from '../chunks/resume-chunk';
import { joinRedactedText, type RedactedText, sliceRedactedText } from '../redaction/redacted-text';
import type { TextSpan } from '../shared/text-span';
import { estimateTokens } from './token-estimate';

/** What {@link chunkResume} needs besides the text. */
export interface ChunkingOptions {
  /** The candidate's alias, which starts every context header. */
  alias: CandidateAlias;
  /** `CHUNK_MAX_TOKENS`: the size above which a section or role is split between bullets. */
  maxTokens: number;
}

/** A heading line: its whole line, and the trimmed title after the `#` marks. */
interface Heading {
  line: TextSpan;
  title: TextSpan;
}

/** A role or a plain section: the text to chunk, and what its context header names. */
interface Unit {
  sectionTitle: TextSpan;
  roleTitle: TextSpan | null;
  body: TextSpan;
}

const SECTION_HEADING = /^##(?!#)[ \t]+(\S.*?)[ \t]*$/gm;
const ROLE_HEADING = /^###(?!#)[ \t]+(\S.*?)[ \t]*$/gm;
/** A top-level list item. Indented items and lines are continuations of the item above. */
const BULLET = /^(?:[-*+]|\d{1,3}[.)])[ \t]/;

/**
 * Splits a redacted resume into retrievable chunks by its structure (SPEC §9.5, ADR 0019).
 *
 * - `##` headings are sections and `###` headings are roles. A role is one chunk and keeps its
 *   `###` line, because the title and dates are evidence. A section without roles is one chunk
 *   without its `##` line, which the context header carries instead. Text before a section's first
 *   role is a chunk of its own.
 * - The preamble before the first `##` (name and contact tokens) isn't chunked.
 * - A chunk over `maxTokens` is split between bullets or paragraphs, never inside one, so a single
 *   oversized bullet stays whole. Every part keeps the role in its context header.
 * - `content` is always the exact slice `[startOffset, endOffset)` of the resume, trimmed, so a
 *   cited quote can be highlighted in place.
 *
 * @example
 * chunkResume(redacted, { alias, maxTokens: CHUNK_MAX_TOKENS });
 * // [{ ordinal: 0, section: 'summary', contextHeader: 'C04 · Summary', content: '…', … }, …]
 */
export function chunkResume(resume: RedactedText, options: ChunkingOptions): ResumeChunk[] {
  return findUnits(resume)
    .flatMap((unit) =>
      packBlocks(resume, findBlocks(resume, unit.body), options.maxTokens).map((span) => ({
        unit,
        span,
      })),
    )
    .map(({ unit, span }, ordinal) => {
      const content = sliceRedactedText(resume, span.start, span.end);
      return {
        ordinal,
        section: resume.slice(unit.sectionTitle.start, unit.sectionTitle.end).toLowerCase(),
        contextHeader: contextHeader(resume, unit, options.alias),
        content,
        startOffset: span.start,
        endOffset: span.end,
        tokenEstimate: estimateTokens(content),
      };
    });
}

/**
 * The text a chunk is embedded as: its context header, a line break, then its content, so a short
 * chunk keeps the section and role it belongs to (SPEC §9.5 step 6).
 *
 * @example
 * toEmbeddingInput(chunk); // 'C04 · Summary\nBuilds APIs.'
 */
export function toEmbeddingInput(chunk: ResumeChunk): RedactedText {
  return joinRedactedText([chunk.contextHeader, chunk.content], '\n');
}

function contextHeader(resume: RedactedText, unit: Unit, alias: CandidateAlias): RedactedText {
  const titles = [unit.sectionTitle, ...(unit.roleTitle === null ? [] : [unit.roleTitle])];
  return joinRedactedText(
    [alias, ...titles.map((title) => sliceRedactedText(resume, title.start, title.end))],
    ' · ',
  );
}

/** Every role and plain section, in resume order. */
function findUnits(resume: string): Unit[] {
  const sections = findHeadings(resume, SECTION_HEADING, { start: 0, end: resume.length });
  return sections.flatMap((section, index) => {
    const end = sections[index + 1]?.line.start ?? resume.length;
    const body = { start: section.line.end, end };
    const roles = findHeadings(resume, ROLE_HEADING, body);
    const intro = { start: body.start, end: roles[0]?.line.start ?? end };
    return [
      { sectionTitle: section.title, roleTitle: null, body: intro },
      ...roles.map((role, roleIndex) => ({
        sectionTitle: section.title,
        roleTitle: role.title,
        body: { start: role.line.start, end: roles[roleIndex + 1]?.line.start ?? end },
      })),
    ];
  });
}

function findHeadings(text: string, pattern: RegExp, within: TextSpan): Heading[] {
  const slice = text.slice(within.start, within.end);
  return [...slice.matchAll(pattern)].map((match) => {
    const start = within.start + match.index;
    const title = match[1] ?? '';
    const titleStart = start + match[0].indexOf(title);
    return {
      line: { start, end: start + match[0].length },
      title: { start: titleStart, end: titleStart + title.length },
    };
  });
}

/**
 * The split points of a unit: each top-level bullet and each paragraph is a block, ending at its
 * last non-blank character. A unit's `###` line is merged into the block after it, so a heading is
 * never a chunk on its own.
 */
function findBlocks(resume: string, body: TextSpan): TextSpan[] {
  const blocks: TextSpan[] = [];
  let current: TextSpan | null = null;
  let afterBlank = true;
  let lineStart = body.start;
  while (lineStart < body.end) {
    const newline = resume.indexOf('\n', lineStart);
    const lineEnd = newline === -1 || newline > body.end ? body.end : newline;
    const line = resume.slice(lineStart, lineEnd);
    if (line.trim() === '') {
      afterBlank = true;
    } else {
      const contentEnd = lineStart + line.trimEnd().length;
      if (current === null || afterBlank || BULLET.test(line)) {
        current = { start: lineStart, end: contentEnd };
        blocks.push(current);
      } else {
        current.end = contentEnd;
      }
      afterBlank = false;
    }
    lineStart = lineEnd + 1;
  }
  return mergeLeadingRoleHeading(resume, blocks);
}

function mergeLeadingRoleHeading(resume: string, blocks: readonly TextSpan[]): TextSpan[] {
  const [first, second, ...rest] = blocks;
  if (first === undefined || second === undefined || !resume.startsWith('###', first.start)) {
    return [...blocks];
  }
  return [{ start: first.start, end: second.end }, ...rest];
}

/** Greedily packs consecutive blocks into spans of at most `maxTokens`; a lone big block stays whole. */
function packBlocks(resume: string, blocks: readonly TextSpan[], maxTokens: number): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const block of blocks) {
    const last = spans.at(-1);
    if (last !== undefined && estimateTokens(resume.slice(last.start, block.end)) <= maxTokens) {
      last.end = block.end;
    } else {
      spans.push({ ...block });
    }
  }
  return spans;
}
