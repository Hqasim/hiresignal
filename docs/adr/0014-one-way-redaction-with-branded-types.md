# 0014. One-way redaction with branded types

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

HireSignal promises blind screening: no model sees a candidate's name, contact details, school or graduation year (SPEC §9.3, §18). Resumes reach models in three places: the embedder, the injection classifier and every prompt builder. A single forgotten call site, such as a new prompt or a debug path, would leak PII to a third-party API. The free Gemini tier may also use prompts to improve Google's products.

Checking this in code review doesn't scale, and a runtime check can't tell a raw resume from redacted text. The guarantee has to live in the types.

Redaction must also leave the job evidence intact. Year ranges in Experience ("2019–2023"), version numbers, metrics and framework names are what the screener rates.

## Decision

**Redact once, before anything else, with pure detectors. The output is a branded type that only the redactor can produce.**

- **The brand:** [`RedactedText`](../../apps/api/src/domain/redaction/redacted-text.ts) is `string & { [redacted]: true }`. `embedDocuments`, `buildInjectionClassifierPrompt`, `spotlight` and every later prompt builder accept resume text only as `RedactedText`, so passing a raw string is a compile error. Tests prove that with `@ts-expect-error`.
- **The producer:** [`redact(text, { personName })`](../../apps/api/src/domain/redaction/redact.ts) is the only function that casts raw text to the brand. The only other cast is `rehydrateRedactedText`, which the Postgres row mappers use for text that was redacted before it was stored.
- **The detectors** live in [`detectors.ts`](../../apps/api/src/domain/redaction/detectors.ts), one per `PiiType`. They are bounded regexes, and multi-word patterns never cross a line break.
  - **PERSON:** the `# Name` heading ([`extractHeaderName`](../../apps/api/src/domain/redaction/header-name.ts)) and each name part. Matching is case-insensitive, with Unicode word boundaries ("Martínez", "O'Connor", "O’Connor"). Initials, "Jr." and credentials after a comma are skipped.
  - **EMAIL:** the full RFC 5322 `atext` set in the local part. The fast-check property test found that a narrower set let `!#x{1}@a.aa` through.
  - **PHONE:** US formats and `+`-prefixed international numbers with 8–15 digits.
  - **URL:** `http(s)://`, `www.`, and LinkedIn or GitHub profiles with a path.
  - **ADDRESS:** a street line, optionally with a unit, and `City, ST 12345`. A street followed by its city counts as one entity. A ZIP alone isn't redacted, because five-digit numbers are usually metrics.
  - **SCHOOL and GRAD_YEAR:** only inside `## Education` ([`findEducationSection`](../../apps/api/src/domain/redaction/education-section.ts)).
- **Tokens:**
  - Overlaps resolve to the match that starts first, then the longest, then a type priority, so an email containing the name stays one `[EMAIL_1]`.
  - Tokens are numbered per type in order of appearance. The same canonical value gets the same token: digits for phones, URLs without scheme or `www.`, and one key for every variant of the name.
  - The summary counts **distinct entities** per type, in a fixed type order.
- **One-way:** `redact()` returns only the redacted text and the counts. Originals are never returned, so they can't be stored or logged. The synthetic `display_name` is kept separately for the shortlist reveal (SPEC §9.3).

## Consequences

- **Positive:**
  - Sending a raw resume to a model doesn't compile. New prompt builders inherit the guarantee by accepting `RedactedText`.
  - Redaction is pure and synchronous, so the table tests, the fast-check properties (no generated email or phone survives, idempotence, PII-free text unchanged) and the 0-leak check over `data/evals/pii.jsonl` run in milliseconds. As of 2026-10-09, coverage of `domain/redaction` is 100% of lines; the gate is 95%.
  - Tokens are stable within a document, so the screener can still reason ("[EMAIL_1] appears twice") and the UI can highlight them.
- **Negative:**
  - These are pattern detectors, not NER. They miss names that aren't in the header (a referee, a cofounder), non-US address formats, a city without a ZIP, and PII inside images. All of these are listed in [`docs/threat-model.md`](../threat-model.md).
  - School names and graduation years outside Education (a university as a client, say) are kept on purpose. That trades a small leak for job evidence the screener needs.
  - The brand is a compile-time guarantee. A deliberate `as RedactedText` cast would defeat it, so the two legitimate casts are documented in place and nothing else may add one.

## Alternatives considered

- **A model-based or NER redactor (spaCy, Presidio, an LLM pass).** Rejected: the input to a PII remover would itself be the raw resume. An LLM pass would send PII to the very model we're protecting. A Python NER service would add a runtime and a deployment, against the $0 constraint. Deterministic detectors are testable, explainable and enough for synthetic resumes with known formats.
- **Redacting at the call site (each prompt builder strips PII).** Rejected: every new builder is a new chance to forget, and the type system couldn't tell redacted from raw text.
- **Reversible pseudonymization (keep a token→value map).** Rejected: nothing in the product needs the originals back, and storing the map would put the PII in the database after all. The shortlist reveal uses the separate synthetic `display_name`.
- **Counting occurrences rather than distinct entities.** Rejected: "PERSON: 7" says how often a name appears, not how much was hidden. The recruiter cares that one name, two emails and one address were removed.
