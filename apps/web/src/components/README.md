# components

Shared building blocks that more than one feature uses.

- **`ui/`:** shadcn/ui primitives, added with `npx shadcn@4.21.4 add <name>`. Change design tokens in `src/index.css`, not the internals.
- **State components:** every async view renders one of four states (frontend rules): `LoadingState` (skeletons with an announced label), `EmptyState`, `ErrorState` (the problem `detail` and request id) and `QuotaBanner` (a 429 from the daily cap; precomputed results still work). `ErrorState` shows the quota banner by itself when the error is a quota refusal.
- **Allowed imports:** `@/lib`, `ui/` and npm packages. Never a feature folder.
