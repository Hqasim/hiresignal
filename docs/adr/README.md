# Architecture decision records

Decisions that shape HireSignal, in Nygard format ([ADR 0001](0001-record-architecture-decisions.md)). Create the next one with `/adr <title>` in Claude Code.

| #    | Decision                                                                                                        | Status            |
| ---- | --------------------------------------------------------------------------------------------------------------- | ----------------- |
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md)                                          | Accepted          |
| 0002 | [Hexagonal architecture with enforced boundaries](0002-hexagonal-architecture-with-enforced-boundaries.md)      | Accepted          |
| 0003 | [TypeScript monorepo with npm workspaces and a contracts package](0003-npm-workspaces-and-contracts-package.md) | Accepted          |
| 0004 | [Single Lambda behind a Function URL](0004-single-lambda-behind-a-function-url.md)                              | Accepted          |
| 0005 | [Neon Postgres + pgvector as the only datastore](0005-neon-postgres-pgvector-only-datastore.md)                 | Accepted          |
| 0006 | [node-postgres everywhere](0006-node-postgres-everywhere.md)                                                    | Accepted          |
| 0007 | [Embedding model, dimensions and normalization](0007-embedding-model-dimensions-and-normalization.md)           | Accepted          |
| 0008 | Hybrid retrieval with RRF                                                                                       | Planned (Phase 6) |
| 0009 | [Record/replay LLM adapter](0009-record-replay-llm-adapter.md)                                                  | Accepted          |
| 0010 | [Rule-based routing with tier fallback](0010-rule-based-routing-with-tier-fallback.md)                          | Accepted          |
| 0011 | Prompt caching via byte-stable prefixes                                                                         | Planned (Phase 5) |
| 0012 | Deterministic scoring with verified citations                                                                   | Planned (Phase 5) |
| 0013 | Layered injection defense and quarantine policy                                                                 | Planned (Phase 3) |
| 0014 | One-way redaction with branded types                                                                            | Planned (Phase 3) |
| 0015 | Precomputed results and a daily call cap                                                                        | Planned (Phase 7) |
| 0016 | [Secrets via GitHub Environments → Lambda env vars](0016-secrets-via-github-environments.md)                    | Accepted          |
| 0017 | [Static SPA on Amplify with CI-driven deploys](0017-static-spa-on-amplify-with-ci-deploys.md)                   | Accepted          |
| 0018 | [Forward-only SQL migrations, run before the code deploy](0018-forward-only-migrations-before-deploy.md)        | Accepted          |
