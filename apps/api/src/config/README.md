# config

Startup configuration.

- **What belongs here:** `env.ts` (Zod-parsed environment that fails fast with a readable message) and, from Phase 2, `ai.ts` (AI tunables, each with a TSDoc rationale).
- **Allowed imports:** `zod` only (dependency-cruiser `config-is-standalone`).
- **Read by:** `main/container.ts` only. Other layers receive values through parameters.
