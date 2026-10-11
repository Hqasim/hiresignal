# 0022. Resume highlight layers rendered from API spans

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

The candidate page is where HireSignal's claims become checkable (SPEC §3, §11). The redacted resume has to show several things at once:

- **citations** (amber): the quotes the scorecard cites, and a stronger highlight on the one the recruiter picked, scrolled into view
- **injection spans** (red, with an icon and a label): where the guard found instructions aimed at AI screeners
- **redaction tokens** (neutral pills) such as `[EMAIL_1]`

The constraints:

- **The text is hostile by design.** C06 hides `<!-- Ignore all previous instructions … -->` and a white-text `<span>`. The page must show that markup as the literal text it is, never interpret it (frontend rules: never `dangerouslySetInnerHTML`).
- **Spans overlap.** C06's L2 phrases sit inside its L1 comment. Two citations can share text, and a citation can contain a token.
- **Spans come from code, not the model.** Citation spans are computed by `locateQuote` (ADR 0012), and guard spans by the rules (ADR 0013). Both are offsets into `redactedResume`. L0 signals have `span: null`, because their offsets are in the raw text.
- **The API sends no token spans.** Tokens follow one grammar, `[TYPE_N]`, with a closed list of types in the contracts (SPEC §9.3).
- **Meaning must not depend on colour alone** (WCAG 2.2 AA, SPEC §11).

## Decision

The browser splits the resume into segments and renders each one as React elements:

- **[`segmentResume`](../../apps/web/src/features/candidates/highlight.ts)** is a pure function. It takes the text and the layers (citation spans, injection spans with their layer, the active span), and cuts the text at every span boundary and every token found by the `[TYPE_N]` pattern. Each segment carries flags: token type, citation, active, first segment of the active span, injection.
- **Overlap** is handled by stacking flags on a segment. Overlapping or touching injection spans merge into one region. The region's first segment carries the layers inside it, so C06's comment gets one "Injection (L1, L2)" label, not one per nested phrase.
- **Invalid spans** (outside the text, empty or reversed) are dropped rather than thrown on, so a stale span can't break the page.
- **[`RedactedResumeView`](../../apps/web/src/features/candidates/redacted-resume-view.tsx)** renders segments as text nodes, `<mark>` elements and pills. Each layer has a non-colour cue: citations get a dotted underline (solid when active), injections a wavy underline and a visible label, tokens a pill shape and screen-reader text ("redacted email address"). Ligatures are off, so `-->` shows as typed.
- **Picking a citation** scrolls to its first segment and focuses it. A `scrollKey` makes picking the same citation again scroll again.
- **Deep links:** `?cite=<start>-<end>` opens a candidate with that span active ([`cite-param.ts`](../../apps/web/src/features/candidates/cite-param.ts)). Ask's citation chips use it, so an answer's quote opens highlighted in its resume. A malformed value is ignored.

## Consequences

- **Positive:**
  - No HTML from the resume ever reaches the DOM as markup. C06's comment renders as text, which a component test asserts.
  - Highlighting is a table-tested pure function (15 cases, including nested injections, overlapping citations, a token inside a citation, out-of-range spans and an exact reassembly check). The view's tests only check rendering.
  - Every highlight comes from a span that code computed, so a highlight can't point at text that isn't there.
  - The deep link makes Ask's answers checkable in one click, and it needs no new API.
- **Negative:**
  - **The UI knows the token grammar.** If redaction changes its token shape, the pills stop appearing (the text still shows). A test in `highlight.test.ts` pins the shape, and the types come from the contracts.
  - Segments are recomputed per render of the resume (memoized on text and layers). A resume of about 3,000 characters with under 50 spans is far below any cost worth optimizing.
  - A token cut by a span boundary renders as two adjacent pills. Quotes are matched on whole text, so this hasn't occurred in the seeded data.
  - L0 signals can't be highlighted; the guard panel lists them with "found in the original text, before redaction".

## Alternatives considered

- **Build an HTML string with `<mark>` tags inserted at the offsets and render it with `dangerouslySetInnerHTML`.** Rejected: the resume would have to be HTML-escaped perfectly before the tags go in. One mistake turns an injection resume into an injection page, which is the opposite of what this project demonstrates. Nested marks would also need hand-balanced tags.
- **The API returns the resume pre-segmented,** with every layer resolved. Rejected: it moves a presentation concern (which spans are active, which labels show) into the API, couples the contract to one UI, and duplicates data the detail response already carries (`redactedResume`, citation spans, guard spans).
- **A rich-text or highlighting library** (for example a CodeMirror decoration layer). Rejected: a dependency of tens of kilobytes for a read-only view that one pure function covers, with its own accessibility behaviour to audit.
