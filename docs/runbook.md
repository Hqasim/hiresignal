# Runbook

How to run, deploy and operate HireSignal. Commands are for Windows PowerShell unless marked otherwise; they also work in bash with `\` line continuations.

Sections still to come, each with its phase:

- reseed production with the `seed-demo` workflow (Phase 10)
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

The defaults in `.env` run the API in `LLM_MODE=replay`, which needs no Gemini key: model calls are answered from `apps/api/fixtures/llm/`.

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

## Gemini setup

You do this once. The key is only needed to call Gemini live: `npm run llm:smoke`, `npm run seed:record` and the production Lambda. Tests and CI never get it ([ADR 0009](adr/0009-record-replay-llm-adapter.md), [ADR 0016](adr/0016-secrets-via-github-environments.md)).

**1. Create a key** in [Google AI Studio](https://aistudio.google.com/apikey) on the free tier. Check on the rate-limits page that the three models in `.env.example` have free-tier limits for your key. Free-tier prompts may be used by Google to improve its products, which is why every resume in this repo is synthetic.

**2. Add it to `.env`**, which git ignores. Keep the model IDs from `.env.example`: the committed fixtures were recorded with them.

```
GEMINI_API_KEY=<your key>
```

**3. Run the smoke check** once. It makes three live calls (one structured generation per tier and one embedding) and writes their fixtures:

```powershell
npm run llm:smoke
```

Success ends with an `llm.smoke_passed` log line. A `llm.smoke_failed` line names the task and HTTP status: 400 or 403 usually means a bad key, 404 a wrong model ID, and 429 a free-tier limit (wait a minute and retry). Commit the new files under `apps/api/fixtures/llm/`.

**4. Give production the key and the model IDs:**

```powershell
gh secret set GEMINI_API_KEY --env production   # paste at the prompt; the value isn't echoed
gh variable set GEMINI_MODEL_LITE      --env production --body "gemini-3.5-flash-lite"
gh variable set GEMINI_MODEL_FLASH     --env production --body "gemini-3.5-flash"
gh variable set GEMINI_EMBEDDING_MODEL --env production --body "gemini-embedding-2"
gh variable set DAILY_LLM_CALL_CAP     --env production --body "300"
```

The deploy fails fast if any of them is missing.

## Seed the local database

Loads the job and the ten resumes from `data/` through ingestion, offline, from the committed fixtures. It connects as `DATABASE_MIGRATION_URL` (the owner role):

```powershell
npm run db:up
npm run db:migrate
npm run seed               # skips resumes that are already stored
npm run seed -- --reset    # deletes the job's candidates, then ingests all ten again
```

It ends with a table of each candidate's guard status, signals, classifier verdict and chunk count, and a `Model calls:` line. In replay mode that line must say `live 0`. As of 2026-10-09, a replay seed takes about 2.5 s.

## Re-record fixtures

Replay keys cover the model ID, the prompt and its version, the schema, the tools and the token limit, so changing any of them makes replay miss with `FixtureMissingError`, whose message names the command to run. With the key in `.env`:

```powershell
npm run llm:smoke      # the smoke fixtures (platform.smoke, embed.query)
```

`npm run seed:record` re-records the seed fixtures (`guard.classify`, `embed.documents`). It always resets the job, so every resume is recorded, and it spaces live calls 6 s apart (`SEED_MIN_CALL_INTERVAL_MS`). Its fixture keys include the resume text, so editing a resume means re-recording. Clear the old seed fixtures first, so stale ones don't linger:

```powershell
Remove-Item -Recurse -Force apps/api/fixtures/llm/guard.classify, apps/api/fixtures/llm/embed.documents -ErrorAction SilentlyContinue
npm run seed:record
```

If its summary reports a fallback, the CLI exits with an error: that fixture was saved under the other tier's model, which replay never asks for. Run it again.

Then, for either command:

1. Delete fixtures that nothing requests any more. Check with `git status`: re-recorded files are new, stale ones are untouched.
2. Run `npm run verify`; replay tests must pass offline.
3. Commit the fixtures in the same commit as the prompt or model change ([ADR 0009](adr/0009-record-replay-llm-adapter.md)).

To change a model ID, change it in `.env.example` and `.env`, re-record, then update the matching `GEMINI_MODEL_*` variable in the `production` environment before pushing.

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

## Rotate the Gemini key

Rotate without downtime by keeping the old key until the new one is live:

1. In [Google AI Studio](https://aistudio.google.com/apikey), create a new key.
2. Update the secret: `gh secret set GEMINI_API_KEY --env production`.
3. Redeploy: `gh run rerun <latest Deploy run id>`, and wait for it to pass.
4. Delete the old key in AI Studio, and update `GEMINI_API_KEY` in your local `.env`.

If the old key leaked, delete it first instead. Until the redeploy finishes, live model calls fail with a 500 problem (Gemini rejects the key, and the call is not retried); health and read-only pages keep working, because they make no model calls.
