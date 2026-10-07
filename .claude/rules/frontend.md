---
paths:
  - "apps/web/**"
---

# Frontend rules (apps/web)

## Structure

| Folder | What goes there |
|---|---|
| `src/app/` | Router, providers, layout, error boundary |
| `src/features/<feature>/` | Components, data hooks (`api.ts`) and tests for one feature: `jobs`, `candidates`, `ask`, `ops`, `about` |
| `src/components/ui/` | shadcn/ui primitives. Change design tokens, not component internals. |
| `src/lib/` | `api-client.ts`, formatting helpers |

- Keep components under about 150 lines.
- Keep presentational components separate from data hooks.
- No business rules in the UI: scores, statuses and name visibility come from the API.

## Data

- Every request goes through `src/lib/api-client.ts`. It parses every response with its `@hiresignal/contracts` schema and turns problem+json into a typed `ApiError`.
- Write one TanStack Query hook per resource or action in `features/<feature>/api.ts`, with stable, typed query keys. Mutations invalidate only what they change.
- Every async view handles four states:
  - loading (skeletons)
  - empty
  - error (show the problem `detail`)
  - quota exceeded (banner; precomputed results still work)

## Rendering and safety

- Render resume text and model output **as text**. Never use `dangerouslySetInnerHTML`.
- Highlights are computed from spans and rendered as React elements.
- Highlight layers:
  - **Citations:** amber.
  - **Injection spans:** red, with an icon and a label.
  - **Redaction tokens:** neutral pills.
- Never rely on color alone to convey meaning.

## Accessibility and UX

- Use semantic HTML, labelled controls and a visible focus ring.
- Everything must work by keyboard. Use `aria-live="polite"` for async results.
- Meet WCAG 2.2 AA contrast.
- Responsive from 360 px wide. Code-split at the route level.
- **Visual direction:** a calm, professional internal tool.
  - One accent color and a consistent spacing and type scale.
  - Dense but legible tables.
  - No decorative gradients or gimmicks.

## Tests

- Write component tests with React Testing Library + MSW.
- Query by role and label, and assert what the user sees, not implementation details.
