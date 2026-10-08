# 0009. Record/replay LLM adapter

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

HireSignal's core features are model calls: the injection classifier, the screening agent, scorecard synthesis, ask, and embeddings. Tests, CI, the eval suite and production seeding all have to exercise those code paths. But:

- **CI has no Gemini key, by rule** (CLAUDE.md rule 2), and must be deterministic and offline.
- **The free tier is rate-limited.** Calling Gemini from every CI run would be slow and flaky, and would eventually exhaust the quota.
- **The demo must be instant and identical everywhere.** Production is seeded with the same results CI tests against.
- **Hand-written fakes alone can't prove integration.** Unit tests use fakes, but something must replay real Gemini output (function calls, thought-signed turns, real token counts) through the real decorator chain.

## Decision

**Record real responses once, commit them, and replay them by request hash.** `LLM_MODE` picks the innermost client in the chain ([ADR 0010](0010-rule-based-routing-with-tier-fallback.md), SPEC §7.3):

| Mode     | Innermost client                | Used by                                                     |
| -------- | ------------------------------- | ----------------------------------------------------------- |
| `live`   | Gemini                          | The production Lambda                                       |
| `record` | Gemini, wrapped by the recorder | `npm run seed:record` and `npm run llm:smoke` (run by hand) |
| `replay` | Fixtures only                   | Unit and integration tests, CI, evals, production seeding   |

- **The key** ([`fixture-key.ts`](../../apps/api/src/infrastructure/llm/replay/fixture-key.ts)) is `sha256(canonicalJson({ kind, model, request }))`:
  - `canonicalJson` sorts object keys at every level, so key order never matters.
  - A generation's request part covers everything that decides the answer: task, prompt version, system prompt, turns, tools, response schema, token limit and temperature.
  - Excluded: the request id, the routing context, and the route's tier, reason and fallback flag. A fallback call to a model replays the same fixture as a direct call to it.
  - An embedding's request part is the task, the texts and the adapter's input-format version (the prefixes from [ADR 0007](0007-embedding-model-dimensions-and-normalization.md) are applied inside the adapter, so the version stands in for them).
- **Fixtures** live at `apps/api/fixtures/llm/<task>/<hash>.json` as `{ kind, key, task, model, recordedAt, response, usage }` ([`fixture-schemas.ts`](../../apps/api/src/infrastructure/llm/replay/fixture-schemas.ts)):
  - `response` is our provider-neutral shape, so replay doesn't depend on SDK types.
  - The model turn is stored as the opaque JSON Gemini returned, thought signatures included.
  - Replay validates each fixture with Zod before using it.
  - They're pretty-printed for review, with number arrays on one line, so a 768-dimension vector is one line. They're excluded from Prettier, because tools write them.
- **The clients** (`infrastructure/llm/replay/`):
  - `RecordingLlmClient` and `RecordingEmbedder` call the live client, save successful responses only, and log the task and key, never content.
  - `ReplayLlmClient` and `ReplayEmbedder` read fixtures and never touch the network.
  - A miss throws `FixtureMissingError`, whose message names the command that records it.
- **Stale fixtures can't replay silently.** Changing a prompt, schema or model ID changes the key and causes a miss. Re-record and commit the fixtures in the same commit as the change.
- **Replay needs the recorded model IDs.** The defaults in `.env.example`, and the variables CI and `seed-demo` use, must match the committed fixtures. A replay test reads the IDs from `.env.example` to enforce this.

## Consequences

- **Positive:**
  - CI and tests are offline, deterministic and free, and still run real model output through the real chain.
  - Production seeding makes zero Gemini calls and produces exactly the data CI tested.
  - Fixtures are reviewable artefacts: a reviewer can read what the model actually returned for each prompt.
  - Recorded latency and token counts replay too, so traces and the cache-ratio metric look like the live run.
- **Negative:**
  - Any prompt change needs a live re-record by a person with a key. That's deliberate friction, and the runbook documents it.
  - Fixtures are only as fresh as the last recording. Model behaviour can drift in production without CI noticing. The live smoke check and the ops page are the guards.
  - Embedding fixtures are large: about 15 kB per vector. At the demo's size (about a hundred chunks), that's a couple of megabytes in git.
  - Replay can't test provider failures. Those are covered by the decorator unit tests with scripted fakes.

## Alternatives considered

- **HTTP-level recording (Polly.js, nock or MSW in record mode).** Rejected: it records transport details (headers, the API key's query parameter, SDK version strings), which makes keys brittle and risks committing secrets. It also ties fixtures to the SDK's wire format rather than our port.
- **Hand-written fakes only.** Rejected: they're right for unit tests, and we use them there. But they can't show that real Gemini output (function calls, thought signatures, schema-shaped JSON) flows through parsing, citation checks and scoring, and evals need real output to mean anything.
- **Calling the live API in CI with a dedicated key.** Rejected: it breaks the no-live-calls rule, puts a secret in CI, and makes builds flaky and quota-bound. Results would also differ run to run, so evals couldn't gate.
