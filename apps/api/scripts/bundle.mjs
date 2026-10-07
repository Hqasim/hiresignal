// Bundles the Lambda entry point into one ESM file that SAM ships as-is (SPEC §21 risks 8 and 9).
// npm workspaces hoist dependencies to the root, so SAM can't package node_modules itself;
// a pre-built bundle sidesteps that entirely.
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = `${root}dist`;

await rm(outdir, { recursive: true, force: true });

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main/lambda.ts'],
  outfile: 'dist/lambda.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // pg optionally requires pg-native, which isn't installed; it must stay an unresolved import.
  external: ['pg-native'],
  // Some CommonJS dependencies call require() on Node built-ins; ESM output has no require.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  sourcemap: true,
  legalComments: 'none',
  metafile: true,
  logLevel: 'info',
});

const bytes = Object.values(result.metafile.outputs).reduce((sum, output) => sum + output.bytes, 0);
console.log(`Bundled ${Object.keys(result.metafile.inputs).length} modules, ${bytes} bytes.`);
