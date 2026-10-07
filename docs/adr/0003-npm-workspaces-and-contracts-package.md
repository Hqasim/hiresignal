# 0003. TypeScript monorepo with npm workspaces and a contracts package

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The API and the web app must agree on every request and response shape. Drift between them is a classic source of bugs that compile cleanly on both sides. Both apps are TypeScript and validate with Zod. The project should use boring, widely understood tooling that runs identically on a Windows laptop and in GitHub Actions, with exact, reproducible installs.

## Decision

- **Monorepo:** one repository with npm workspaces (`packages/*`, `apps/*`, `e2e`), declared in the root [`package.json`](../../package.json).
- **Pinning:** `.npmrc` sets `save-exact=true` and `engine-strict=true`. `package-lock.json` is the only lockfile, and CI installs with `npm ci`.
- **Node:** 24.21.0 everywhere (`.nvmrc`, `engines`, `actions/setup-node` with `node-version-file`).
- **Shared code:** [`packages/contracts`](../../packages/contracts/) holds Zod schemas and inferred types for every HTTP shape, and it's the only code the two apps share. The API's route tests validate responses with these schemas. The web app's [`api-client.ts`](../../apps/web/src/lib/api-client.ts) parses every response with them.
- **Source-only package:** contracts ships TypeScript source (`"exports": { ".": "./src/index.ts" }`) with no build step. Vite, esbuild, tsx and Vitest compile it where it's used.
- **Linking:** workspace packages are linked with `"@hiresignal/contracts": "*"`, because npm has no `workspace:` protocol.
- **Peer conflicts:** resolved with root `overrides`, documented in the commit that adds them, never with `--legacy-peer-deps`.

## Consequences

- **Positive:** a change to a contract breaks the compile and tests of both apps in the same commit. There's one install, one lockfile and one CI cache.
- **Positive:** the source-only package removes a build step, watch mode and stale `dist/` problems. Editors jump straight to the schema source.
- **Negative:** hoisting lets a workspace import a package it never declared. dependency-cruiser's `no-non-package-json` rule compensates ([ADR 0002](0002-hexagonal-architecture-with-enforced-boundaries.md)).
- **Negative:** every consumer must be able to compile TypeScript from `node_modules`. That holds for our toolchain, but the package could not be published to npm as-is.
- **Negative:** npm's peer-dependency strictness needed two `overrides` in Phase 0. One lets `eslint-plugin-jsx-a11y` accept ESLint 10. The other moves `shell-quote` to a patched version.

## Alternatives considered

- **pnpm or Yarn workspaces.** Rejected: both need an extra tool that npm already covers. pnpm's strict layout would remove the hoisting problem, but it adds a package manager to every contributor's setup and to CI for a two-app repo.
- **Turborepo or Nx on top of workspaces.** Rejected: task caching and graph orchestration pay off with many packages. Here they would add configuration and concepts without measurable speed-up.
- **Separate repositories with a published contracts package.** Rejected: every contract change would need a publish and two version bumps, which is the drift we're trying to prevent.
- **Generating types from an OpenAPI document.** Rejected for the source of truth: Zod schemas validate at runtime as well as type-check, and an OpenAPI document can still be generated from them later (SPEC §10, Should).
