# Runbook

How to run, deploy and operate HireSignal. Commands are for Windows PowerShell unless marked otherwise; they also work in bash with `\` line continuations.

Sections still to come, each with its phase:

- reseed (Phase 4)
- re-record fixtures (Phases 2, 4)
- rotate the Gemini key (Phase 2)
- quota exhausted (Phase 7)
- branch protection (Phase 9)

## Local setup

Prerequisites:

- Node 24.21.0 (`nvm install 24.21.0; nvm use 24.21.0`), which bundles npm 11.19.0+
- Docker Desktop (WSL 2)
- Git

Keep the repo outside OneDrive or Google Drive folders.

```powershell
npm ci                    # exact install from package-lock.json; also installs the git hooks
Copy-Item .env.example .env
npm run db:up             # Postgres + pgvector on localhost:5433
npm run db:migrate        # apply db/migrations/*.sql (safe to repeat)
npm run verify            # format, lint, typecheck, boundaries, unit tests
npm run test:integration  # repositories and hybrid search against the local database
npm run dev               # API on http://localhost:3000, web on http://localhost:5173
```

Open http://localhost:5173. The card should say **API: healthy**. If it says **API: degraded**, the database isn't reachable: run `npm run db:up`.

### Local database

- **Data** lives in the `db-data` Docker volume and survives `npm run db:down`. To start over, remove the volume and migrate again:

  ```powershell
  docker compose down --volumes
  npm run db:up; npm run db:migrate
  ```

- **Integration tests** create a throwaway database per test file (`hs_test_…`) on the same server and drop it afterwards, so they never touch your `hiresignal` database. CI points `TEST_DATABASE_URL` at its service container.
- **Migrations are forward-only** ([ADR 0018](adr/0018-forward-only-migrations-before-deploy.md)). Never edit an applied file; add `db/migrations/NNNN_description.sql`. The runner refuses to start if an applied file changed. Keep each migration additive: production migrates before the new code is deployed.

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

**4. Set up the Neon database** (next section).

**5. Push `main`.** CI runs, and when it succeeds the Deploy workflow migrates the database, then deploys the API and the web app. Watch them:

```powershell
gh run watch
```

## Neon database setup

You do this once, before the first deploy that runs migrations ([ADR 0005](adr/0005-neon-postgres-pgvector-only-datastore.md), [ADR 0006](adr/0006-node-postgres-everywhere.md)).

**1. Create the project** in the Neon Console: name `hiresignal`, Postgres 18, region **AWS US East 1 (N. Virginia)**, the same region as the Lambda.

**2. Create the runtime role with SQL, not in the Console.** Roles created in the Console, CLI or API join `neon_superuser`. A role created with `CREATE ROLE` gets only what the migrations grant it. Generate a password locally (48 hex characters, 192 bits; Neon requires at least 60 bits of entropy):

```powershell
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
```

Then, in the Neon SQL Editor, signed in as the owner:

```sql
CREATE ROLE hiresignal_app WITH LOGIN PASSWORD '<the 48-character hex string>';
```

Create the role **before** the first migration runs. `0002_app_role_grants.sql` grants privileges only to a role that already exists.

**3. Build the two connection strings** from the Console's connection dialog:

| Secret                   | Role             | Endpoint                           | Used by                    |
| ------------------------ | ---------------- | ---------------------------------- | -------------------------- |
| `DATABASE_URL`           | `hiresignal_app` | **pooled** (host has `-pooler`)    | the Lambda                 |
| `DATABASE_MIGRATION_URL` | owner            | **direct** (host has no `-pooler`) | `npm run db:migrate` in CI |

In both, replace the query string `?sslmode=require&channel_binding=require` with `?sslmode=verify-full`. node-postgres treats `require` as an alias for `verify-full` and warns about it, and the pool enables channel binding on its own.

**4. Store them as environment secrets.** Paste each value at the prompt, so it stays out of your shell history:

```powershell
gh secret set DATABASE_URL --env production
gh secret set DATABASE_MIGRATION_URL --env production
gh secret list --env production
```

## Deploy

Every push to `main` that passes CI deploys automatically (`.github/workflows/deploy.yml`):

1. migrate Neon
2. `sam deploy`
3. smoke-test `/api/health`, which must report `db: "up"`
4. deploy the web app

To redeploy the same commit, re-run the latest Deploy run: `gh run rerun <run-id>`. Migrations are idempotent, so re-running is safe.

## Rollback

Revert the bad commit on `main` and push (`git revert <sha>; git push`). CI and Deploy ship the previous code. The API reports the running commit at `GET /api/health` (`gitSha`), so you can confirm the rollback.

Migrations don't roll back. They are additive, so the previous code keeps working with the newer schema. If a migration itself is wrong, fix it with a new migration.

## Neon cold starts

On the free plan, Neon suspends the compute after 5 minutes without queries. The next connection waits while it resumes, usually well under a second.

- **What you see:** the first `/api/health` after a quiet period is slower; later calls are fast. The web app calls health on load, so it wakes Lambda and Neon together.
- **Bound:** the pool's connect timeout is 10 s (`CONNECT_TIMEOUT_MS` in [`create-pool.ts`](../apps/api/src/infrastructure/postgres/create-pool.ts)). If Neon doesn't answer in time, health returns `200` with `status: "degraded"` and `db: "down"`, and CloudWatch logs `health.db_unreachable` with the request id.
- **If it keeps happening:** check the Neon Console for the project's status and compute-hour usage (100 CU-hours a month on the free plan), then call health again.

## Rotate the database password

1. In the Neon SQL Editor, as the owner, run `ALTER ROLE hiresignal_app WITH PASSWORD '<new hex password>';` (generate it as in setup step 2).
2. Update the secret: `gh secret set DATABASE_URL --env production`.
3. Redeploy: `gh run rerun <latest Deploy run id>`. Until it finishes, the running Lambda fails to connect and health reports `degraded`.

To rotate the owner's password, reset it in the Neon Console and update `DATABASE_MIGRATION_URL` the same way. The running API doesn't use it.
