# application

Use cases and the ports they depend on.

- **What belongs here:**
  - use cases as factory functions (`create<UseCase>(deps)`)
  - ports (`ports/`): interfaces for everything outside the process (LLM, embedder, repositories, clock, logger)
  - typed errors (`errors/`)
  - prompt builders and LLM output schemas (from Phase 2)
- **Allowed imports:** `domain/` and `zod` (dependency-cruiser `application-depends-on-domain-only`).
- **Tests:** with hand-written fakes from `test/fakes/`; coverage gate ≥ 80%.
- **Entry points:** `errors/index.ts` (`AppError` and subclasses), `ports/`.
