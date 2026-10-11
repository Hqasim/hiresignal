# @hiresignal/web

The HireSignal single-page app: Vite + React 19 + TypeScript, Tailwind CSS v4 and shadcn/ui (Radix), React Router, TanStack Query. It deploys as static files to AWS Amplify Hosting ([ADR 0017](../../docs/adr/0017-static-spa-on-amplify-with-ci-deploys.md)).

| Folder                     | What goes there                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`                 | Router (a lazy chunk per page), layout, navigation, error boundary, not-found page                                               |
| `src/features/jobs/`       | `/` and `/ask` redirects, the job page: `CandidateTable`, `GuardBadge`, `ScoreBar`, `MustHaves`                                  |
| `src/features/candidates/` | The candidate page: `RedactedResumeView` and `segmentResume` (ADR 0022), `ScorecardPanel`, guard panel, shortlist, re-run, trace |
| `src/features/ask/`        | `AskPanel`, golden-set `SuggestedQuestions`, `AnswerCard` with `?cite=` links                                                    |
| `src/features/ops/`        | Stat tiles, route mix, per-model table, recent calls                                                                             |
| `src/features/about/`      | What, why, how it works, links                                                                                                   |
| `src/features/health/`     | The footer's API health line                                                                                                     |
| `src/components/`          | Loading, empty, error and quota states; `ui/` holds shadcn primitives (change tokens in `src/index.css`)                         |
| `src/lib/`                 | `api-client.ts` (contract-validated fetch, `ApiError`, `isQuotaExceeded`), `format.ts`                                           |
| `src/test/`                | MSW server, `renderWithProviders`, problem builders, fixtures shaped like the seeded data                                        |

- **Allowed imports:** `@hiresignal/contracts` and npm packages. Nothing from `apps/api` (dependency-cruiser `web-not-to-api`).
- **Data:** every request goes through `src/lib/api-client.ts`; each feature has one hook per resource or action in its `api.ts`.
- **API origin:** `VITE_API_BASE_URL` is baked in at build time. Leave it empty locally; Vite proxies `/api` to `localhost:3000`.
- **Replay mode:** locally, Ask answers only the golden questions (the suggestions); any other question shows the `FIXTURE_MISSING` problem.
- **Adding a shadcn component:** `npx shadcn@4.21.4 add <name>` from this folder. The CLI is not a dependency; `src/styles/shadcn-tailwind.css` is vendored from the same version.
