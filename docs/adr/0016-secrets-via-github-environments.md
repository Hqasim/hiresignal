# 0016. Secrets via GitHub Environments → Lambda env vars

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The live system needs a few secrets: the Gemini API key from Phase 2, and Neon connection strings for the app role and the migration owner from Phase 1. It also needs non-secret settings: AWS role and region, Amplify IDs, the allowed CORS origin, model IDs and the daily call cap. The budget is $0, and nothing secret may live in git. CI must never see the Gemini key (all tests run in replay mode). The deploy pipeline must not hold long-lived AWS credentials.

## Decision

- **Where values live:** secrets and settings are stored in the GitHub Environment `production`, as encrypted secrets and plain variables (SPEC §16). Its deployment branch policy allows only `main`.
- **AWS access:** the deploy job in [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) is the only job bound to that environment. It assumes AWS credentials through GitHub OIDC; [`infra/bootstrap.yaml`](../../infra/bootstrap.yaml) trusts only `repo:<owner>/hiresignal:environment:production`. No AWS access keys exist anywhere.
- **Into Lambda:** secrets are passed to `sam deploy` as `NoEcho` CloudFormation parameters and become Lambda environment variables. The API reads and validates them once at cold start ([`config/env.ts`](../../apps/api/src/config/env.ts)). Validation errors name the variable, never its value.
- **CI:** `ci.yml` has read-only permissions and no access to environment secrets.
- **Local development:** uses a git-ignored `.env` based on the committed `.env.example`.
- **Phase 0 scope:** only non-secret variables (`AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `AMPLIFY_APP_ID`, `AMPLIFY_BRANCH`, `ALLOWED_ORIGIN`) are needed. Each secret is added in the phase that first uses it.

## Consequences

- **Positive:**
  - $0. Secrets are encrypted at rest by GitHub and scoped to one environment and one branch.
  - Only one job can read them, and the AWS role can only be assumed from that job.
- **Positive:** rotation is "update the GitHub secret, re-run the deploy". There's no extra AWS service to manage.
- **Negative:**
  - Lambda environment variables are visible in plaintext to anyone with `lambda:GetFunctionConfiguration` on the function. We accept this: the account has one admin and the deploy role.
  - CloudFormation `NoEcho` hides values in stack output, but they still pass through the deploy job.
- **Negative:** rotation needs a redeploy, and there's no automatic rotation.

## Alternatives considered

- **AWS Secrets Manager.** Rejected: $0.40 per secret per month breaks the $0 target, and runtime fetches add latency and IAM surface to cold starts.
- **SSM Parameter Store SecureString.** Rejected for now: free at standard tier, but it needs runtime `GetParameter` calls (or the Parameters and Secrets extension), KMS permissions and more deploy-role scope. It remains the upgrade path if the env-var exposure becomes a concern.
- **Repository-level secrets.** Rejected: any workflow on any branch could read them, and they can't be tied to the OIDC environment claim.
