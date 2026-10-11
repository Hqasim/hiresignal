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
// Replay mode needs the model IDs (they key the fixtures) but no Gemini key; health makes no LLM call.
process.env.GEMINI_MODEL_LITE = 'smoke-lite';
process.env.GEMINI_MODEL_FLASH = 'smoke-flash';
process.env.GEMINI_EMBEDDING_MODEL = 'smoke-embedding';
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

// An oversized POST, built from the same event, must be refused by the body limit (SPEC §10)
// inside the Lambda adapter too: 413 problem+json, before any route or database work.
const oversized = JSON.stringify({ question: 'x'.repeat(17 * 1024) });
const postEvent = {
  ...event,
  rawPath: '/api/jobs/senior-fullstack-ai/ask',
  headers: { ...event.headers, 'content-type': 'application/json' },
  requestContext: {
    ...event.requestContext,
    http: {
      ...event.requestContext.http,
      method: 'POST',
      path: '/api/jobs/senior-fullstack-ai/ask',
    },
  },
  body: oversized,
};
const refused = await handler(postEvent, { awsRequestId: 'smoke-413' });
const problem = JSON.parse(refused.body);
if (
  refused.statusCode !== 413 ||
  refused.headers['content-type'] !== 'application/problem+json' ||
  problem.code !== 'PAYLOAD_TOO_LARGE'
) {
  console.error('Bundle body-limit smoke test failed:', refused.statusCode, refused.body);
  process.exit(1);
}
console.log(`Bundle body-limit smoke test passed: ${refused.statusCode} ${problem.code}`);
