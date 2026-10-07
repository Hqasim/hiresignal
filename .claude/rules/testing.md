---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "apps/api/test/**"
  - "apps/api/evals/**"
  - "apps/api/fixtures/**"
  - "e2e/**"
---

# Testing rules

## Writing tests

- **Name tests as behaviour,** for example: `it('quarantines a resume whose hidden comment tells the screener to ignore its instructions')`.
- **Structure:** Arrange, Act, Assert, with one behaviour per test.
- **Rule sets and detectors:** use table-driven tests (`it.each`), and always include benign hard negatives.
- **Fakes over mocks:** prefer hand-written fakes that implement the ports (`FakeLlmClient` with scripted turns, `InMemoryChunkRepository`) to mocking libraries. Fakes live in `apps/api/test/fakes/`.
- **Determinism:**
  - no network, no real time, no unseeded randomness
  - inject `Clock`
  - use the replay adapter for anything that talks to an LLM

## Integration and fixtures

- **Integration tests** run against Postgres + pgvector: Docker locally, a service container in CI.
  - Each test file starts from a freshly migrated schema and cleans up after itself.
  - Use deterministic unit vectors for vector tests.
- **LLM fixtures** in `apps/api/fixtures/llm/` are written only by `pnpm seed:record` or `pnpm llm:smoke`.
  - Never edit them by hand.
  - A missing fixture must fail with a message telling the developer to re-record.
- **Property-based tests (fast-check) for redaction:**
  - generated emails and phone numbers never survive
  - redaction is idempotent
  - text without PII is unchanged

## E2E

- Locate elements by role, label or test id. Never use arbitrary waits.
- Tag the production-safe subset `@smoke`.
- Run axe on every main page and fail on serious or critical violations.

## Evals and coverage

- **Eval thresholds** live in `apps/api/evals/thresholds.ts`.
  - Set each one just below the first measured result.
  - Only ever raise them. Lowering one needs an ADR.
- **Coverage gates:** `domain/` ≥ 90% lines and branches; `application/` ≥ 80%.
- Test behaviour and edge cases, not lines.
