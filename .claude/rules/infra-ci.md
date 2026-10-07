---
paths:
  - "infra/**"
  - ".github/**"
  - "docker-compose.yml"
---

# Infrastructure and CI rules

## Allowed resources

Only these billable surfaces may exist:

- one Lambda and its Function URL
- the Lambda's log group (7-day retention)
- the SAM managed artifact bucket
- the Amplify app and its `main` branch
- one AWS Budget

Anything else needs my approval (SPEC §16).

## `infra/bootstrap.yaml`

I deploy this stack once by hand. It contains:

- the GitHub OIDC provider, created only if a parameter says it doesn't exist yet
- a least-privilege deploy role:
  - trusted only for `repo:<owner>/hiresignal`, ref `main` and environment `production`
  - permissions scoped to `hiresignal-*` resources, the SAM managed stack and bucket, and the one Amplify app
- the Amplify app (no repository connection), the `main` branch and the SPA rewrite rule
- a $1/month budget with an email alert

Outputs: role ARN, Amplify app ID, Amplify default domain.

## `infra/template.yaml` (SAM)

- One function:
  - `nodejs24.x`, `arm64`, 1024 MB, 60 s timeout
  - `CodeUri: apps/api/dist`, pre-built; no SAM build method
  - Function URL with `AuthType: NONE` and CORS limited to the Amplify origin (GET and POST, `content-type`)
- An explicit log group with 7-day retention.
- Secrets arrive as `NoEcho` parameters and become environment variables.
- Output: `ApiUrl`.

## GitHub Actions

- Set least-privilege `permissions:` per workflow and job. Only deploy jobs get `id-token: write`.
- Pin GitHub and AWS official actions to a major version. Pin any other action to a full commit SHA with a version comment. Dependabot keeps them current.
- Use `concurrency` so deploys never overlap. Install with `npm ci`.
- Set up Node with `actions/setup-node`, `node-version-file: .nvmrc` (24.21.0) and `cache: npm`. Never hard-code a Node version in a workflow.
- No long-lived AWS keys anywhere. Deploys assume the OIDC role inside the `production` environment.
- CI never needs `GEMINI_API_KEY`.
- Make every step that could fail silently explicit:
  - `curl --fail`
  - poll the Amplify job until it reports `SUCCEED`
  - check stack outputs before using them
