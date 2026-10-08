// Invokes the built bundle (dist/lambda.mjs) with a Lambda Function URL event (payload 2.0)
// and checks the health response. Catches ESM/CJS bundling mistakes before a deploy does
// (SPEC §21 risk 9). Run after `npm run build -w @hiresignal/api`.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const event = JSON.parse(
  await readFile(`${root}test/fixtures/function-url-health-event.json`, 'utf8'),
);

process.env.GIT_SHA = 'smoke-test';
process.env.LLM_MODE = 'replay';
// Nothing listens on port 1, so the health route's database ping fails fast and the response
// shows the bundle loaded and ran node-postgres (SPEC §21 risk 9).
process.env.DATABASE_URL = 'postgres://smoke:smoke@127.0.0.1:1/smoke';
const { handler } = await import(pathToFileURL(`${root}dist/lambda.mjs`).href);

const result = await handler(event, { awsRequestId: 'smoke' });
const body = JSON.parse(result.body);

// The database is unreachable on purpose: 'down' proves node-postgres was bundled and ran.
if (
  result.statusCode !== 200 ||
  body.status !== 'degraded' ||
  body.db !== 'down' ||
  body.gitSha !== 'smoke-test'
) {
  console.error('Bundle smoke test failed:', result.statusCode, result.body);
  process.exit(1);
}
console.log(`Bundle smoke test passed: ${result.statusCode} ${result.body}`);
