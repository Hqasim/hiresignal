# 0017. Static SPA on Amplify with CI-driven deploys

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The web app is a client-rendered React SPA (SPEC §11). It needs HTTPS, a CDN, deep-link support for client-side routes and a public URL. It must cost nothing during the demo's life, and every deploy should run only after CI has passed on the exact same commit. The API's origin (a Function URL) is known only after the SAM stack deploys.

## Decision

- **Build:** Vite produces static files (`npm run build -w @hiresignal/web`). There's no SSR.
- **Hosting:** an AWS Amplify Hosting app created by [`infra/bootstrap.yaml`](../../infra/bootstrap.yaml), with **no repository connection** and auto-build off.
  - The `main` branch is the production branch.
  - A rewrite rule serves `/index.html` with status 200 for any path that isn't a static asset, so deep links like `/candidates/:id` work.
- **Deploys:** [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) deploys after CI succeeds:
  1. Build with `VITE_API_BASE_URL` set to the `ApiUrl` stack output, which Vite bakes in at build time.
  2. Zip `dist/`, then call `amplify create-deployment` and upload the zip.
  3. Call `start-deployment`, then poll `get-job` until it reports `SUCCEED`.
  4. Smoke-test both the root and a deep link.
- **CORS:** the Function URL's CORS allows only this app's `https://main.<app-id>.amplifyapp.com` origin.

## Consequences

- **Positive:** no Amplify build minutes, no SSR compute, and a CDN with TLS included. The deployed web build always pairs with the API commit deployed in the same job.
- **Positive:** one pipeline owns both deploys, and every failure surfaces in one workflow run.
- **Negative:**
  - Amplify is free only during the account's first 12 months; after that, storage and transfer cost cents per month (SPEC §16).
  - The default `amplifyapp.com` domain isn't branded.
- **Negative:**
  - Because the API URL is baked in at build time, changing it means rebuilding and redeploying the web app.
  - Amplify's own preview and branch features go unused.

## Alternatives considered

- **Amplify connected to the GitHub repository (Amplify builds).** Rejected: builds would run outside our CI gates, consume build minutes, and need a second copy of the build configuration and of `VITE_API_BASE_URL`.
- **S3 + CloudFront.** Rejected: more resources to define and secure (origin access control, cache policies, a 403→index.html error mapping for deep links), and no simpler than Amplify's managed equivalent.
- **GitHub Pages, Netlify or Vercel.** Rejected: free and capable, but they add a second cloud account and vendor to the security and cost story, and SPEC §16 keeps hosting on AWS beside the API. Pages also lacks server-side rewrites, which forces hash routing or a 404.html trick.
