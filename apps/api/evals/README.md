# evals

The eval suites behind `npm run eval` (SPEC §14, [ADR 0023](../../../docs/adr/0023-evals-as-ratcheting-ci-gates.md)). Results are in [`docs/evals.md`](../../../docs/evals.md).

- **Responsibility:** score the product's claims. Retrieval quality and its ablation, injection detection with and without the classifier, PII leaks, and the integrity of stored scorecards.
- **What belongs here:** pure scoring over ids, labels and numbers (`*-suite.ts`, `golden-report.ts`, `retrieval-metrics.ts`), the gates ([`thresholds.ts`](thresholds.ts), which only ratchet up) and [`checkGates`](gates.ts), and the Markdown report ([`eval-report.ts`](eval-report.ts)). Running the product's code against the data is wiring, so it lives in [`src/main/eval-wiring.ts`](../src/main/eval-wiring.ts).
- **Allowed imports:** `src/domain/` and `zod`. Nothing here imports `src/main/`; `main` imports these modules.
- **Entry points:** `npm run eval` (the CLI in `src/main/cli/eval.ts`) and `npm run ask:golden`, which shares the retrieval metrics.
