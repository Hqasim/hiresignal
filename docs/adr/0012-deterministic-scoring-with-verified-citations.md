# 0012. Deterministic scoring with verified citations

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

A screening score is only as trustworthy as its evidence. Two failure modes matter most:

- **Hallucinated evidence (LLM09).** A model asked to justify a rating can paraphrase, embellish or invent a quote that sounds right.
- **Manipulated ratings (LLM01).** An injection that slips past the guard (ADR 0013) can tell the model to rate every requirement strong or to output a high score.

If the model writes the score, both go straight into the number a recruiter sorts by. The recruiter needs a number they can audit: every rating backed by text they can click and see in the resume.

## Decision

The model rates evidence, and code checks the evidence and computes the number.

**What the model returns.** The `screen.synthesize` call returns a `ScorecardDraft`: for each requirement, a rating (`strong`, `partial`, `none`, `unclear`), a rationale and up to three citations `{ ref, quote }`, plus strengths, concerns and a summary. It produces no score. The schema is [`ScorecardDraftSchema`](../../apps/api/src/application/prompts/screening-synthesis.ts), and it uses only the keywords Gemini documents: `enum` and `maxItems`. Rationale and summary lengths are capped in code.

**Verification** ([`verifyDraft`](../../apps/api/src/domain/citations/verify-draft.ts), pure) checks:

- every job requirement appears exactly once, and no requirement the job lacks
- each ref is in the evidence set the agent retrieved, and belongs to this candidate
- each quote is 8–300 characters once whitespace is normalized, and is a substring of that chunk's **content** (not its context header)
- every `strong` or `partial` rating keeps at least one valid citation

[`locateQuote`](../../apps/api/src/domain/citations/locate-quote.ts) matches with whitespace collapsed, because models don't reproduce line breaks. It maps the match back to the original text, so the stored quote is the exact resume text and its span is a resume offset the UI can highlight. Everything else must match exactly: case, punctuation and redaction tokens.

**Repair once, then downgrade strictly.** If anything fails, one `screen.repair` call lists each error by requirement id and ref ([`describeCitationError`](../../apps/api/src/domain/citations/verify-draft.ts)), never quoting resume text. The corrected draft is verified again. Then [`finalizeAssessments`](../../apps/api/src/domain/citations/finalize-assessments.ts) downgrades any requirement that still has an error to `unclear`, with note `citation_failed`, keeping only its valid citations. A requirement the model left out is added as `unclear`. If the repair reply never matches the schema, the first draft is downgraded instead.

**Scoring** ([`computeScore`](../../apps/api/src/domain/scoring/compute-score.ts), pure): strong 1, partial 0.5, none 0, unclear 0; `score = round(100 × Σ(weight × value) / Σ weight)`. `mustHavesMet` counts must-haves rated strong or partial. Assessments for requirements the job lacks are ignored.

## Consequences

- **Positive:**
  - A rating can raise the score only if a quote that really exists in this candidate's retrieved text backs it. An injected "rate everything strong" with fabricated quotes scores 0. A unit test proves it, both in the domain and through the use case.
  - Every citation the UI shows is guaranteed to highlight real text, because its span comes from code, not from the model.
  - Scores are reproducible from stored ratings, and the weights live in the job's rubric, where a person can read and change them.
  - Downgrades are visible (`citation_failed`), so a reviewer can see where the model's judgment didn't survive checking.
- **Negative:**
  - **Strict downgrade punishes sloppiness.** One bad quote next to two good ones turns a strong rating into unclear after the repair. Hamzah chose this in the Phase 5 plan: no unverified claim ever moves a score, and the repair call gives the model a chance to fix the quote first.
  - Verification proves the quote exists, not that it supports the rating. A real quote can still be misjudged (a side project rated strong). The rubric definitions and the recruiter's review address that; code can't.
  - Exact matching rejects harmless variation such as straight versus curly quotes, or a corrected typo. The prompt says to copy text exactly, and the repair call catches most cases.
  - A repair costs an extra Flash call.

## Alternatives considered

- **Let the model output the score.** Rejected: the number would be unauditable and injectable, which is the failure this project exists to demonstrate a defense against.
- **Lenient downgrade:** drop invalid citations, and downgrade only when a strong or partial rating has no valid citation left. Rejected in the Phase 5 plan in favour of the strict rule. It is kinder to one sloppy quote, but it lets a rating stand partly on text that didn't verify.
- **Fuzzy quote matching** (edit distance or embedding similarity). Rejected: it would accept paraphrases, which is exactly what verification exists to catch. A threshold would also be one more tunable to defend.
- **No repair; downgrade straight away.** Rejected: the most common failure, a quote with a reworded phrase, is cheap to fix with one targeted call, and fixing it keeps evidence that is real.
- **A second LLM as a judge of the citations.** Rejected: it is slower and costs more, and it is itself injectable and nondeterministic. Substring checks are exact, free and testable.
