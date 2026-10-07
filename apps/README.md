# apps

Deployable applications.

| Workspace | What it is                                                        |
| --------- | ----------------------------------------------------------------- |
| `api/`    | Hono API on AWS Lambda behind a Function URL; hexagonal layers    |
| `web/`    | Vite + React SPA, deployed as static files to AWS Amplify Hosting |

The two apps share code only through [`packages/contracts`](../packages/contracts/). dependency-cruiser fails the build if `web` imports anything from `api`.
