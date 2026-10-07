// Architecture rules from SPEC §7.1, enforced by `npm run depcruise` locally and in CI.
// Paths are relative to the repo root.

const API = '^apps/api/src';
// Tests may import vitest, fast-check and test fakes; the layer rules govern production code.
const TESTS = '[.]test[.]tsx?$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular imports hide layering mistakes.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Every import must resolve to a file on disk.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-non-package-json',
      comment:
        'npm hoists packages to the root node_modules, so a workspace could import a package it never declared. ' +
        'Every npm import must be listed in the package.json of the importing workspace.',
      severity: 'error',
      from: { pathNot: '^node_modules' },
      to: { dependencyTypes: ['unknown', 'undetermined', 'npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'domain-is-pure',
      comment: 'domain/ may import only domain/ and zod: no I/O, no SDKs, no Node built-ins.',
      severity: 'error',
      from: { path: `${API}/domain/`, pathNot: TESTS },
      to: { pathNot: [`${API}/domain/`, '^node_modules/zod/'] },
    },
    {
      name: 'application-depends-on-domain-only',
      comment: 'application/ holds use cases and ports; it may import only domain/ and zod.',
      severity: 'error',
      from: { path: `${API}/application/`, pathNot: TESTS },
      to: { pathNot: [`${API}/(application|domain)/`, '^node_modules/zod/'] },
    },
    {
      name: 'config-is-standalone',
      comment: 'config/ parses env and holds AI tunables; it may import only zod.',
      severity: 'error',
      from: { path: `${API}/config/`, pathNot: TESTS },
      to: { pathNot: [`${API}/config/`, '^node_modules/zod/'] },
    },
    {
      name: 'interfaces-not-to-adapters',
      comment: 'interfaces/ receives use cases from main/; it never reaches adapters or config.',
      severity: 'error',
      from: { path: `${API}/interfaces/` },
      to: { path: `${API}/(infrastructure|main|config)/` },
    },
    {
      name: 'infrastructure-not-to-outer-layers',
      comment:
        'Adapters implement application ports; they never depend on HTTP or the composition root.',
      severity: 'error',
      from: { path: `${API}/infrastructure/` },
      to: { path: `${API}/(interfaces|main)/` },
    },
    {
      name: 'nothing-imports-main',
      comment: 'main/ is the composition root; nothing in src depends on it.',
      severity: 'error',
      from: { path: `${API}/`, pathNot: `${API}/main/` },
      to: { path: `${API}/main/` },
    },
    {
      name: 'sdks-only-in-infrastructure',
      comment: 'The model SDK and the DB driver stay behind ports (SPEC §7.1).',
      severity: 'error',
      from: { pathNot: [`${API}/infrastructure/`, '^node_modules'] },
      to: { path: '^node_modules/(@google/genai|pg|pg-[^/]+)/' },
    },
    {
      name: 'web-not-to-api',
      comment: 'The web app shares only @hiresignal/contracts with the API.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/api/' },
    },
    {
      name: 'contracts-are-a-leaf',
      comment: 'Contracts are transport shapes; they import only zod.',
      severity: 'error',
      from: { path: '^packages/contracts/', pathNot: TESTS },
      to: { pathNot: ['^packages/contracts/', '^node_modules/zod/'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Anchored to workspace build output; an unanchored '/dist/' would also drop edges into node_modules/*/dist.
    exclude: { path: ['^apps/[a-z-]+/(dist|coverage)/', '^packages/[a-z-]+/(dist|coverage)/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
