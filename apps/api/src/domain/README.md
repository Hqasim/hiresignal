# domain

Pure business rules: entities, branded types, redaction, guard rules and policy, chunking, routing policy, scoring, citation checks, vector math.

- **What belongs here:** synchronous, deterministic functions and types. No I/O, no `Date.now()`, no unseeded randomness; take a `Clock` value or timestamp as input instead.
- **Allowed imports:** other `domain/` modules and `zod`. Node built-ins and SDKs are forbidden (dependency-cruiser `domain-is-pure`).
- **Tests:** next to the code (`*.test.ts`); coverage gate ≥ 90% lines and branches.
- **Entry points:** `shared/assert-never.ts` for exhaustive switches; branded ids and Zod schemas for every persisted value in `jobs/`, `candidates/` (including chunk refs like `C04#3`), `guard/`, `redaction/`, `scoring/`, `chunks/`, `vectors/` (`normalize`, `cosineSimilarity`) and `routing/`; `routing/policy.ts` picks the model tier for each LLM task (ADR 0010).
