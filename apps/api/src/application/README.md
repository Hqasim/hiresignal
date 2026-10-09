# application

Use cases and the ports they depend on.

- **What belongs here:**
  - use cases as factory functions (`create<UseCase>(deps)`), such as `smoke/check-llm-platform.ts` and `guard/classify-injection.ts` (the L3 classifier)
  - ports (`ports/`): interfaces for everything outside the process (`LlmClient`, `RoutedLlmClient`, `Embedder`, repositories, clock, logger)
  - typed errors (`errors/`)
  - LLM helpers (`llm/`): `generateStructured` (Zod schema → JSON Schema → parse, one repair turn), `LlmCallError`, JSON types
  - prompt builders (`prompts/`), each exporting `PROMPT_VERSION`, and `spotlight()`, which wraps every piece of untrusted text
- **Allowed imports:** `domain/` and `zod` (dependency-cruiser `application-depends-on-domain-only`). Tunables from `config/` arrive as parameters.
- **Tests:** with hand-written fakes from `test/fakes/`; coverage gate ≥ 80%.
- **Entry points:** `ports/llm-client.ts`, `llm/generate-structured.ts`, `errors/index.ts` (`AppError` and subclasses).
