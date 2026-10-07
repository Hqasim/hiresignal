# 0004. Single Lambda behind a Function URL

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The API serves a public, read-mostly demo with low and bursty traffic. It must cost $0/month (SPEC §16), deploy from CI without long-lived keys, and stay simple enough to reason about in one template. Requests are short JSON calls, plus a few LLM-backed calls that can take tens of seconds.

## Decision

The whole Hono app runs in one AWS Lambda function, `hiresignal-api`, invoked through a Lambda Function URL ([`infra/template.yaml`](../../infra/template.yaml)).

- **Function settings:** `nodejs24.x` on arm64, 1024 MB, 60 s timeout.
- **Handler:** async, from [`@hono/aws-lambda`](../../apps/api/src/main/lambda.ts), which reads Function URL payload v2.0.
- **Code:** esbuild pre-bundles it into `apps/api/dist/lambda.mjs`, and SAM only zips that folder. This avoids SAM's build step and npm-workspace hoisting problems.
- **CORS:** handled by the Function URL configuration and limited to the Amplify origin. The app adds no CORS headers, which avoids duplicate headers.
- **Access:** `AuthType: NONE`. The demo is deliberately unauthenticated. SAM adds the `InvokeFunctionUrl` and `InvokeFunction` (`InvokedViaFunctionUrl`) permissions that Function URLs require.
- **Logs:** an explicit log group with 7-day retention.
- **Warm starts:** clients are created once per cold start in [`main/container.ts`](../../apps/api/src/main/container.ts), and warm invocations reuse them.

## Consequences

- **Positive:**
  - Inside the Lambda always-free allowance; Function URLs add no charge.
  - One deploy unit and one log group.
  - A bundle smoke test with a real Function URL event ([`scripts/smoke-bundle.mjs`](../../apps/api/scripts/smoke-bundle.mjs)) runs in CI before every deploy.
- **Positive:** the same Hono app serves Lambda, the local Node server and route tests (`app.request()`).
- **Negative:**
  - No API Gateway features (usage plans, WAF, request validation at the edge). Rate limiting is our own daily-cap middleware.
  - The URL is a generated `*.lambda-url.*.on.aws` hostname, not a custom domain.
- **Negative:** cold starts (plus Neon scale-to-zero from Phase 1) can add latency to the first request. The web app calls `/api/health` on load to warm both.

## Alternatives considered

- **API Gateway (HTTP API) in front of Lambda.** Rejected: it adds a resource and a per-request charge after the free-tier period, and HTTP APIs time out at 30 s, which is tight for LLM calls. Its extra features aren't needed for a demo.
- **One Lambda per route.** Rejected: more cold starts, more IAM and log configuration, and duplicated bundling for no isolation benefit at this scale.
- **A container on App Runner, ECS/Fargate or Fly.io.** Rejected: always-on or minimum-instance costs break the $0 target, and they add image builds and registries to the pipeline.
