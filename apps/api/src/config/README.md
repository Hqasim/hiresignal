# config

Startup configuration.

- **What belongs here:**
  - `env.ts`: the Zod-parsed environment, which fails fast with a readable message and never echoes values. `parseEnv` covers the API, `parseMigrationEnv` the migrator and `parseSmokeEnv` the smoke CLI.
  - `ai.ts`: AI tunables (SPEC §7.5), each with a TSDoc rationale. Model IDs and the daily cap are env vars, because they differ by environment.
- **Allowed imports:** `zod` only (dependency-cruiser `config-is-standalone`).
- **Read by:** `main/` only. Other layers receive values through parameters.
