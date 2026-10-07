# 0002. Hexagonal architecture with enforced boundaries

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The API's core behaviour is safety logic that has to be easy to test and hard to bypass: redaction, injection guards, citation checks and deterministic scoring. It also depends on things that are slow, rate-limited or likely to change: Gemini, Postgres and the Lambda runtime. Tests must run offline (no live LLM calls in CI). The model provider should be swappable without touching use cases. Layering conventions that live only in a README erode quietly, especially when much of the code is written with an AI assistant.

## Decision

`apps/api/src` is split into ports-and-adapters layers (SPEC §7.1):

| Layer              | Responsibility                 | May import                                         |
| ------------------ | ------------------------------ | -------------------------------------------------- |
| `domain/`          | pure rules and types           | `domain/`, `zod`                                   |
| `application/`     | use cases, ports, prompts      | `domain/`, `zod`                                   |
| `infrastructure/`  | adapters (SDKs live only here) | `application/`, `domain/`, SDKs                    |
| `interfaces/http/` | Hono routes, problem+json      | `application/`, `domain/`, `@hiresignal/contracts` |
| `config/`          | env parsing, tunables          | `zod`                                              |
| `main/`            | composition root, entry points | everything                                         |

Use cases receive their ports as factory-function parameters. Only [`main/container.ts`](../../apps/api/src/main/container.ts) reads config and wires adapters.

The rules are code, not conventions. [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs) fails `npm run verify` and CI on:

- a forbidden layer import
- an SDK import outside `infrastructure/`
- any import from `main/`
- a circular dependency
- an unresolvable import
- an npm import the workspace didn't declare

Test files are exempt from the purity rules so they can import Vitest and fakes.

## Consequences

- **Positive:**
  - Domain and application code is tested with hand-written fakes; no network, no mocking library.
  - The LLM provider, the database and the HTTP framework are each replaceable behind one adapter.
  - Reviewers can see the boundaries in the config and in CI rather than taking them on trust.
- **Positive:** cross-cutting LLM concerns (routing, fallback, retry, call logging) become decorators around one port, composed in one place.
- **Negative:**
  - More files and indirection than a route-handler-calls-SDK design. Small features touch several folders.
  - The dependency-cruiser config needs care. For example, `preserveSymlinks` is required so workspace packages are checked against each workspace's own `package.json`.

## Alternatives considered

- **Layered by convention only (folders plus a README).** Rejected: nothing stops a route from importing `pg`, and erosion is invisible until it's expensive.
- **Feature folders with no layer rules (framework-centric Hono app).** Rejected: business rules would mix with HTTP and SDK code, forcing integration tests for logic that should be pure. Swapping the model provider would mean editing use cases.
- **ESLint `no-restricted-imports` instead of dependency-cruiser.** Rejected: it handles simple path bans, but not cycles, unresolvable imports, or undeclared dependencies hidden by npm hoisting.
