# Responsible AI

**Status:** as of 2026-10-12, this describes the deployed demo. HireSignal is a portfolio project that screens synthetic resumes. It isn't a hiring product, and it hasn't had a bias audit (see [Regulation](#regulation)).

Automated screening fails people in two ways. It can judge them on who they are instead of what they've done, and it can be gamed by whoever writes the resume. HireSignal's design answers both: the model never sees identity, every rating must quote the resume, code computes the score, and a person makes the only decision. This page says what each safeguard does, where it lives in the code, and where it stops. The security side of the same controls is in the [threat model](threat-model.md).

## Blind screening

PII is removed before any model sees a resume ([`redact.ts`](../apps/api/src/domain/redaction/redact.ts), [ADR 0014](adr/0014-one-way-redaction-with-branded-types.md)):

| Hidden                                   | Shown to the model and the recruiter as |
| ---------------------------------------- | --------------------------------------- |
| The candidate's name and its variants    | `[PERSON_1]`                            |
| Email addresses, phone numbers           | `[EMAIL_1]`, `[PHONE_1]`                |
| Profile links and other URLs             | `[URL_1]`                               |
| Street addresses and `City, ST 12345`    | `[ADDRESS_1]`                           |
| Schools and graduation years (Education) | `[SCHOOL_1]`, `[GRAD_YEAR_1]`           |

- **Schools and graduation years are hidden because they are proxies:** prestige for class, graduation year for age.
- **Redaction is one-way.** The original text is never stored. The database keeps the redacted resume and, separately, the synthetic display name for the reveal.
- **The type system enforces it.** The embedder, the injection classifier and every prompt builder accept resume text only as `RedactedText`, which only `redact()` can produce. Sending raw resume text to a model is a compile error, not a code-review catch.
- **The recruiter is blind too.** The candidate list shows aliases (`C01`…`C10`); the API returns `displayName: null` until a person shortlists that candidate ([`candidate-dto.ts`](../apps/api/src/interfaces/http/mappers/candidate-dto.ts)).

The PII eval checks the redaction on every push: 0 leaks over 44 labelled entities and the 10 seeded names ([evals](evals.md)).

## Protected attributes

The screening prompt ([`screening-prefix.ts`](../apps/api/src/application/prompts/screening-prefix.ts)) tells the model:

> Never infer, mention or consider age, gender, ethnicity, race, nationality, immigration status, religion, disability, health, pregnancy, marital or family status, sexual orientation, or any other protected attribute, and never use proxies for them such as names, graduation years, school prestige, photos, addresses, accents or gaps in employment.

It also tells the model to refer to the candidate by alias only, never by a guessed name or pronoun. An instruction is not a guarantee, which is why the controls below don't depend on the model obeying it.

## Evidence, not impressions

- **The model rates evidence, per requirement:** `strong`, `partial`, `none` or `unclear`, against a rubric with operational definitions. It never writes a number, and it's told not to recommend hiring or rejecting.
- **Every `strong` or `partial` rating must cite a verbatim quote.** Code checks each quote against the stored resume at an exact span. A rating whose evidence doesn't verify, after one repair attempt, becomes `unclear` ([ADR 0012](adr/0012-deterministic-scoring-with-verified-citations.md)).
- **Code computes the score** from the ratings and the job's requirement weights ([`compute-score.ts`](../apps/api/src/domain/scoring/compute-score.ts)). The same ratings always give the same score, and anyone can recompute it.
- **The reasoning is inspectable.** The candidate page shows every rating with its rationale and clickable quotes, and the agent's trace: every tool call it made while gathering evidence.

The scorecard eval re-verifies every stored citation and recomputes every score on every push: 73/73 citations and 8/8 scores as of 2026-10-12.

## A person decides

- **Nothing is rejected automatically.** There is no reject action in the product. The ranking orders the list; it doesn't remove anyone from it.
- **Shortlisting is the one decision,** and a person makes it. It's also the moment the name is revealed, so identity can't influence who gets that far.
- **Quarantine isn't rejection.** A resume carrying instructions for AI screeners isn't scored, because its score can't be trusted. It stays visible in its own section, with the exact text and the detection layers that fired, for a person to review. v1 has no way to release a resume from quarantine; a reviewer override is future work.

## Data

- **Every resume and the job are synthetic** ([`data/`](../data/README.md)), written for this project. No real candidate's data has been used.
- That matters beyond privacy: the free Gemini tier may use prompts to improve Google's products. Real resumes would need a paid tier with data-use terms, or another provider.
- Logs carry ids, counts, hashes, durations and token usage, never resume text, prompts, model output or questions. A test enforces it ([`json-console-logger.ts`](../apps/api/src/infrastructure/logging/json-console-logger.ts)).

## Limits

- **Redaction isn't perfect.** Names outside the header (a referee, a nickname), non-US addresses, and schools or years outside the Education section survive ([threat model, Known limits](threat-model.md#known-limits)).
- **Some proxies remain on purpose.** Employers and role dates are the evidence the job asks for, and they also hint at age and background. Hiding them would make screening impossible.
- **The model can misjudge evidence.** Verification proves a quote exists, not that it means what the rating says. A person reads the quotes before shortlisting.
- **Fairness hasn't been measured.** There's no evaluation on counterfactual resumes (the same resume with a different name, school or dates). It's listed as future work in [SPEC §22](SPEC.md#22-future-work).
- **The evals are small and hand-written,** and the retrieval set is saturated ([evals, Limits](evals.md#limits)).
- **English only.** The redaction detectors and injection rules assume English resumes.

## Regulation

Hiring is a regulated use of AI:

- **New York City Local Law 144** requires an independent bias audit of an automated employment decision tool within the year before use, a published summary of the results, and notice to candidates.
- **The EU AI Act** lists AI systems for recruitment and candidate evaluation as high-risk (Annex III). Providers must meet requirements for risk management, data governance, logging, transparency and human oversight.

HireSignal has had no bias audit and meets none of these obligations as a product. Several of its choices point the way such a product would need to go: human oversight at the decision, logged and reproducible scores, evidence a candidate could be shown, and data minimization by default.
