# 0023. Evals as ratcheting CI gates over replayed fixtures

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

HireSignal makes four claims that unit tests alone don't measure. Answers are grounded in the right candidates. Injected resumes are caught, and benign ones aren't punished. PII never survives redaction. Every stored score is backed by verified quotes. Each claim needs a number that a reviewer can read and a regression can't quietly move (SPEC §2: "Eval thresholds met; results published in `docs/evals.md` and in the CI job summary").

The constraints:

- **CI has no Gemini key and must not call a model** (CLAUDE.md rule 2), and the free tier allows Flash only 20 requests a day. An eval that calls the model live can't run on every push.
- **The datasets are small and hand-written:** 23 golden questions, 40 injection items, 15 PII snippets. They can catch a regression, but they can't establish a quality level that holds in general.
- **Two suites have an ablation the SPEC asks for:** vector-only vs hybrid retrieval, and rules only vs rules + classifier.
- **The injection gate needs a definition of "detected".** The guard has three outcomes: clean, flagged and quarantined.

## Decision

`npm run eval` runs four suites against the seeded job and `data/evals/`, in replay mode, and gates CI on them.

- **Replay, so it is deterministic and free.** Every model call reads a committed fixture (ADR 0009). The classifier verdicts for the 35 injection items that reach L3 were recorded once by `npm run eval -- --mode record`, which `npm run seed:record` chains, so a full re-record covers them. A missing fixture fails the run with the command to record it.
- **Pure suites, shared wiring.** Each suite is a pure module in [`apps/api/evals/`](../../apps/api/evals/) that scores ids, labels and numbers. [`main/eval-wiring.ts`](../../apps/api/src/main/eval-wiring.ts) runs the same code paths the product runs: the ask use case through the `ask:golden` wiring, ingestion's guard order with the classifier built as seeding builds it, `redact` and `prepareResume`, and the stored scorecards re-checked with `verifyCitation` and `computeScore`.
- **"Detected" means flagged or quarantined.** Both outcomes are visible to the recruiter. The quarantine count is reported beside it, because it is the stricter outcome. A classifier that turns a flag into a quarantine shows up there without changing recall.
- **Gates ratchet.** [`thresholds.ts`](../../apps/api/evals/thresholds.ts) starts each gate one measurable step below the first result, or at the SPEC §14 bar where that is stricter. On sets this small, one step is one question or one item. So recall@5 ≥ 0.95 and MRR ≥ 0.90 (first measured 1.000 and 0.950), malicious recall 1.00 and benign FPR ≤ 0.05 (first measured 1.000 and 0.000), zero PII leaks, and 100% scorecard integrity. Gates only move up, and lowering one needs an ADR. A gate whose value is undefined, such as an empty dataset, fails.
- **One report, three places.** The same Markdown goes to the console, to the GitHub Actions job summary, and with `--write` into a marked block of [`docs/evals.md`](../evals.md). Its tables are padded the way Prettier formats them, so the written file passes `format:check`.

## Consequences

- **Positive:**
  - Every push proves the four claims offline in well under a minute, with no key and no quota.
  - The ablations are measured by the same runner, so the docs show what each layer adds, not just the final number.
  - Re-checking stored scorecards with the production verifier catches a regression anywhere between the model's reply and the database, for example a mapper that shifts a span.
  - The published numbers come from the run itself, never from someone's notes.
- **Negative:**
  - Replay measures the recorded behaviour. A new model or prompt is measured only after its fixtures are re-recorded.
  - Small sets saturate. Recall@5 is already 1.000, so the retrieval gate is a regression gate, not a quality claim, and `docs/evals.md` says so.
  - Counting flagged items as detected means a flagged attack is still scored. Defense in depth covers that case (verified citations, the score computed in code, ADR 0012), but the gate alone doesn't prove it.
  - An ADR to lower a gate is friction by design. A legitimately harder dataset needs one too.

## Alternatives considered

- **LLM-as-judge for answer and scorecard quality.** Rejected for the gate: it adds a model call per item (live in CI, or yet more fixtures) and a judge whose own errors need evaluating. The integrity checks here are exact. Judged quality is listed as future work.
- **Live evals on a schedule (nightly, with the real key).** Rejected: the free tier allows Flash 20 requests a day, a nightly run would compete with the public demo's daily cap, and a result that changes from night to night can't gate a merge.
- **Counting only quarantined items as detected.** Rejected as the gate definition: the rules alone quarantine 5 of 20 attacks, and flagging is a real, visible outcome. The quarantine count is still reported, so the stricter view is one column away.
- **Fixed thresholds set by judgement** (for example recall ≥ 0.8). Rejected: a loose bar lets a real regression through while still passing. Starting just below the measured result makes any drop visible.

## Update (2026-10-12, Phase 10): the README's gates table is generated too

SPEC §13.3 asks for the evals table in the README, copied from `docs/evals.md`. A copy goes stale the first time a number moves, so `npm run eval -- --write` writes both: the full report between the markers in `docs/evals.md`, and the dated verdict with the gates table (`renderGatesSummary`) between `<!-- eval-gates:start -->` and `<!-- eval-gates:end -->` in `README.md`. `replaceGeneratedBlock` takes the markers as a parameter. Both files are read and checked before either is written, so a missing marker changes neither.
