# Runbook

How to run, deploy and operate HireSignal. Commands are for Windows PowerShell unless marked otherwise; they also work in bash with `\` line continuations.

Sections still to come, each with its phase:

- reseed (Phase 4)
- re-record fixtures (Phases 2, 4)
- rotate the Gemini key (Phase 2)
- quota exhausted (Phase 7)
- Neon cold starts (Phase 1)
- branch protection (Phase 9)

## Local setup

Prerequisites:

- Node 24.21.0 (`nvm install 24.21.0; nvm use 24.21.0`), which bundles npm 11.19.0+
- Docker Desktop (WSL 2)
- Git

Keep the repo outside OneDrive or Google Drive folders.

```powershell
npm ci                 # exact install from package-lock.json; also installs the git hooks
Copy-Item .env.example .env
npm run verify         # format, lint, typecheck, boundaries, unit tests
npm run dev            # API on http://localhost:3000, web on http://localhost:5173
npm run db:up          # Postgres + pgvector on localhost:5433 (needed from Phase 1)
```

Open http://localhost:5173. The card should say **API: healthy**.

## First deploy

You do this once, with an AWS admin profile and `gh auth login` done. It creates the deploy role and the Amplify app, then gives GitHub the values the deploy workflow needs.

**1. Deploy the bootstrap stack.** Set `CreateOidcProvider=false` if the account already has the `token.actions.githubusercontent.com` provider. GitHub signs deploy jobs with the immutable subject `repo:<owner>@<owner-id>/<repo>@<repo-id>:…`, so the stack needs both numeric IDs; this reads them from the repository's OIDC settings:

```powershell
$prefix = gh api repos/Hqasim/hiresignal/actions/oidc/customization/sub --jq .sub_claim_prefix
$ownerId = [regex]::Match($prefix, '@(\d+)/').Groups[1].Value
$repoId = [regex]::Match($prefix, '@(\d+)$').Groups[1].Value
"$prefix -> owner $ownerId, repo $repoId"
aws cloudformation deploy --region us-east-1 --stack-name hiresignal-bootstrap `
  --template-file infra/bootstrap.yaml --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides GitHubOwner=Hqasim GitHubOwnerId=$ownerId RepoName=hiresignal RepoId=$repoId `
    CreateOidcProvider=true BudgetEmail=<your-email>
```

**2. Create the `production` environment** and allow deployments only from `main`:

```powershell
gh api --method PUT repos/Hqasim/hiresignal/environments/production `
  -F "deployment_branch_policy[protected_branches]=false" `
  -F "deployment_branch_policy[custom_branch_policies]=true"
gh api --method POST repos/Hqasim/hiresignal/environments/production/deployment-branch-policies `
  -f name=main -f type=branch
```

**3. Copy the stack outputs into environment variables:**

```powershell
# The parentheses matter: Windows PowerShell 5.1 passes a parsed JSON array down the
# pipeline as one object unless it is enumerated first.
$outputs = @{}
(aws cloudformation describe-stacks --region us-east-1 --stack-name hiresignal-bootstrap `
  --query "Stacks[0].Outputs" --output json | ConvertFrom-Json) |
  ForEach-Object { $outputs[$_.OutputKey] = $_.OutputValue }
gh variable set AWS_DEPLOY_ROLE_ARN --env production --body $outputs.DeployRoleArn
gh variable set AWS_REGION          --env production --body "us-east-1"
gh variable set AMPLIFY_APP_ID      --env production --body $outputs.AmplifyAppId
gh variable set AMPLIFY_BRANCH      --env production --body "main"
gh variable set ALLOWED_ORIGIN      --env production --body $outputs.WebOrigin
gh variable list --env production
```

**4. Push `main`.** CI runs, and when it succeeds the Deploy workflow deploys the API and the web app. Watch them:

```powershell
gh run watch
```

## Deploy

Every push to `main` that passes CI deploys automatically (`.github/workflows/deploy.yml`). To redeploy the same commit, re-run the latest Deploy run: `gh run rerun <run-id>`.

## Rollback

Revert the bad commit on `main` and push (`git revert <sha>; git push`). CI and Deploy ship the previous code. The API reports the running commit at `GET /api/health` (`gitSha`), so you can confirm the rollback.
