# 0019. Section-aware chunking with exact offsets

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Every retrieval feature reads resume chunks: the screening agent's `search_resume` and `read_section` tools (Phase 5) and Ask the talent pool (Phase 6). How a resume is cut decides three things:

- **What a search hit means.** A chunk should be one piece of evidence ("this role", "these projects") that a recruiter can read on its own.
- **Whether a citation can be checked and shown.** The citation verifier checks that a quote is a substring of a chunk, and the UI highlights the quote in the full resume. Both need each chunk to sit at known offsets in the stored text (SPEC §9.6).
- **Whether short chunks still retrieve well.** A bullet such as "Ran Postgres in production" means little without the role and section it belongs to.

The resumes are Markdown with a fixed shape (SPEC §12): `## ` sections, and `### ` roles under Experience and Projects. They are short: 150–350 words, with no section near `CHUNK_MAX_TOKENS` (350).

## Decision

[`chunkResume`](../../apps/api/src/domain/chunking/chunk-resume.ts) is a pure function in `domain/chunking/` that cuts the **redacted** resume by its structure:

- **Units:**
  - Every `###` role is one unit, and keeps its `###` line, because the title, company and dates are evidence (R1 asks for years).
  - A section without roles is one unit, without its `##` line, which the context header carries instead.
  - Text before a section's first role is a unit of its own.
  - The preamble before the first `##` (name and contact tokens) isn't chunked: it holds no job evidence.
- **Splitting:** a unit over `CHUNK_MAX_TOKENS` is split greedily between top-level bullets or paragraphs, never inside one. A single oversized bullet stays whole. A role's `###` line is merged into the block after it, so a heading is never a chunk on its own. Tokens are estimated as ⌈characters / 4⌉ ([`estimateTokens`](../../apps/api/src/domain/chunking/token-estimate.ts)), which is enough for a limit far below the embedder's.
- **Offsets:** `content` is always the exact slice `[startOffset, endOffset)` of `candidates.redacted_resume`, trimmed. Nothing is rewritten, so a verified quote maps straight to a highlight span.
- **Context headers:** each chunk gets `C04 · Experience · Senior Engineer, Acme (2021–2024)`. A continuation part keeps the role. The header is **embedded** with the content ([`toEmbeddingInput`](../../apps/api/src/domain/chunking/chunk-resume.ts): header, a line break, then content), and Postgres full-text search indexes it too. It isn't part of `content`, so offsets stay exact.
- **Types:** `content` and `contextHeader` are `RedactedText`, built with `sliceRedactedText` and `joinRedactedText` ([ADR 0014](0014-one-way-redaction-with-branded-types.md), 2026-10-09 update). Phase 5 and 6 prompts can then spotlight them without a cast.

## Consequences

- **Positive:**
  - A hit is a whole role or section, which is what the agent asks for (`read_section`) and what a recruiter recognizes.
  - Citation verification and highlighting need no fuzzy matching: offsets are exact by construction. Two tests guard this. A fast-check property generates resumes and checks the slices, that every bullet lands in exactly one chunk, and that the limit holds unless a chunk is a single block. The seed integration test checks every stored chunk against `redacted_resume`.
  - Chunking is pure and runs in microseconds, so the dataset test chunks all ten resumes on every unit-test run.
  - As of 2026-10-09, the eight resumes that aren't quarantined produce 6–7 chunks each, 53 in all, from 12 to 232 estimated tokens: none needed splitting.
- **Negative:**
  - It relies on the resume's Markdown structure. A resume without `##` headings yields no chunks at all, and one long unstructured section yields one chunk per paragraph. Real uploads (PDF/DOCX, SPEC §22) would need layout-aware sectioning first.
  - Chunk sizes vary with how people write (one role may be 40 tokens, another 300), so retrieval scores aren't normalized by length.
  - Skipping the preamble means a summary line placed before `## Summary` isn't retrievable. C07's injection line sits there, but C07 is quarantined anyway.

## Alternatives considered

- **Fixed token windows with overlap** (for example 200 tokens, 50 overlapping). Rejected: windows cut through roles and bullets, so a hit can mix two jobs. Overlap duplicates text, which makes "every quote appears in exactly one chunk" false and complicates highlighting. It is the right default for long unstructured documents, not for short structured resumes.
- **One chunk per resume.** Rejected: the embedding of a whole resume blurs every requirement together, so search can't find the one role that shows RAG experience. The agent's per-requirement search would always return the same chunk.
- **Sentence-level chunks.** Rejected: a sentence loses its role and dates, and ten times as many vectors add noise without helping recall on resumes this short.
- **Splitting raw text, then redacting each chunk.** Rejected: redaction needs the whole document (the header name, the Education section, consistent token numbering), and offsets would then refer to text that is never stored.
