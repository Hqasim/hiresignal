# @hiresignal/web

The HireSignal single-page app: Vite + React 19 + TypeScript, Tailwind CSS v4 and shadcn/ui (Radix), React Router, TanStack Query. It deploys as static files to AWS Amplify Hosting ([ADR 0017](../../docs/adr/0017-static-spa-on-amplify-with-ci-deploys.md)).

| Folder               | What goes there                                                                  |
| -------------------- | -------------------------------------------------------------------------------- |
| `src/app/`           | Router, providers, layout                                                        |
| `src/features/<x>/`  | One feature's components, data hooks (`api.ts`) and tests                        |
| `src/components/ui/` | shadcn/ui primitives; change design tokens in `src/index.css`, not the internals |
| `src/lib/`           | `api-client.ts` (contract-validated fetch, `ApiError`), helpers                  |
| `src/test/`          | Test setup: MSW server, render helpers                                           |

- **Allowed imports:** `@hiresignal/contracts` and npm packages. Nothing from `apps/api` (dependency-cruiser `web-not-to-api`).
- **API origin:** `VITE_API_BASE_URL` is baked in at build time. Leave it empty locally; Vite proxies `/api` to `localhost:3000`.
- **Adding a shadcn component:** `npx shadcn@4.21.4 add <name>` from this folder. The CLI is not a dependency; `src/styles/shadcn-tailwind.css` is vendored from the same version.
