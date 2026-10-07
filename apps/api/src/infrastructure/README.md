# infrastructure

Adapters that implement application ports with real technology.

- **What belongs here:** one folder per technology (`logging/`, `clock/`; later `llm/`, `postgres/`), with adapters named `<Tech><Port>`.
- **Allowed imports:** `application/`, `domain/` and SDKs. This is the only layer that may import `@google/genai` or `pg` (dependency-cruiser `sdks-only-in-infrastructure`).
- **Never imports:** `interfaces/` or `main/`.
- **Entry points:** `logging/json-console-logger.ts`, `clock/system-clock.ts`.
