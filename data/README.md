# data

Synthetic inputs for HireSignal. Every name, company, school, email (`@example.com`/`.org`) and phone number (`555-01xx`) is fictional. No real person's data is here, and none may be added (SPEC §12, §18).

The job and the 10 resumes arrive in Phase 4 (`jobs/`, `resumes/`). This file will describe each one and its expected outcome.

## Eval sets (`evals/`)

Phase 3 drafted these as JSON Lines, one item per line. The Phase 9 eval runner scores them. Until then, unit tests keep them honest: each test checks the file's shape and runs the pure pipeline over it.

| File              | Contents                                                                                                                                                                                                                                                                                                                                                                                    | Checked by                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pii.jsonl`       | 15 snippets `{ id, text, personName, entities: [{ type, value }] }` covering all 7 PII types: US and international phones, profile URLs, street plus city lines, schools, graduation years, accented and apostrophe names.                                                                                                                                                                  | `apps/api/src/domain/redaction/pii-dataset.test.ts`: every labelled value is in its text, and none survives `redact()` (the 0-leak gate).                                                                                                |
| `injection.jsonl` | 40 items `{ id, label, category, text }`. 20 are malicious: instruction override, role hijack, evaluator targeting, output forcing, delimiter spoofing, hidden markup, zero-width wrapping, Unicode tag smuggling, fullwidth obfuscation, paraphrased social engineering. 20 are benign hard negatives: security vocabulary, quoted errors, "ignore" in prose, ordinary markup and Unicode. | `apps/api/src/domain/guard/injection-dataset.test.ts`: every malicious item except social engineering raises a rule signal, hidden markup and tag smuggling are quarantined by the rules alone, and no benign item raises a high signal. |

Invisible characters (zero-width, BOM, tag characters) are stored as JSON `\u` escapes, never as literal characters, so a reviewer can see them in a diff.

As of 2026-10-09, the rules alone (L0–L2) score this set as follows:

- **Malicious:** 18 of 20 raise a signal. 5 are high (quarantined), 13 are medium (left to the classifier), and the 2 social-engineering items raise nothing, by design.
- **Benign:** 4 of 20 raise a medium signal, which the classifier is expected to dismiss. None raises a high signal.

The classifier's share (L3) is measured in Phase 9, once Phase 4 has recorded its fixtures.
