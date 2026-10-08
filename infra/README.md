# infra

Infrastructure as code for HireSignal on AWS (`us-east-1`). Everything here stays within the free tiers listed in SPEC §16.

| File             | Deployed by                                    | What it creates                                                                                                                                              |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bootstrap.yaml` | You, once, with an admin profile               | GitHub OIDC provider (optional), the `hiresignal-github-deploy` role, the Amplify app + `main` branch + SPA rewrite, a $1/month budget                       |
| `template.yaml`  | `.github/workflows/deploy.yml` (SAM, via OIDC) | The `hiresignal-api` Lambda (`nodejs24.x`, arm64, 1024 MB, 60 s), its Function URL (CORS limited to the Amplify origin) and a log group with 7-day retention |

## Why two stacks

The deploy role can't be created by the pipeline that uses it, and it must not be able to change its own permissions. So the bootstrap stack is applied by hand, and the deploy role may manage only the `hiresignal-api` stack and the SAM managed artifact stack (`aws-sam-cli-managed-default`).

## Deploy role guardrails

- Trusted only for the immutable OIDC subject `repo:<owner>@<owner-id>/hiresignal@<repo-id>:environment:production`, so a renamed or re-created repository can't assume it. The `production` environment's branch policy allows only `main`.
- May create only roles named `hiresignal-api-*`, attach only `AWSLambdaBasicExecutionRole` to them, and pass them only to Lambda. It can't create a powerful role.
- Amplify permissions cover only the one app.

## Commands

The exact copy-paste commands for the first deploy are in [`docs/runbook.md`](../docs/runbook.md#first-deploy). The deploy workflow runs `sam deploy` itself:

```sh
npm run build -w @hiresignal/api   # esbuild → apps/api/dist/lambda.mjs
sam deploy --template-file infra/template.yaml --stack-name hiresignal-api --resolve-s3 \
  --capabilities CAPABILITY_IAM --parameter-overrides GitSha=<sha> AllowedOrigin=https://main.<app-id>.amplifyapp.com
```

Check both templates with `sam validate --lint --region us-east-1 --template-file infra/<file>.yaml`.
