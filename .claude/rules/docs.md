---
paths:
  - "docs/**"
  - "**/README.md"
---

# Documentation rules

## Audience

Recruiters skim, hiring managers judge outcomes, and senior engineers and architects judge decisions. Lead with what and why, and keep depth one click away.

## ADRs

- **File:** `docs/adr/NNNN-kebab-title.md`, in Nygard format with these sections:
  - Title
  - Status
  - Date
  - Context
  - Decision
  - Consequences (positive and negative)
  - Alternatives considered (at least two, with the reason each was rejected)
- One decision per ADR. Link to the code paths it governs.
- Keep the index in `docs/adr/README.md` current.

## Other docs

- **Diagrams:** Mermaid in Markdown (C4-style flowcharts, sequence diagrams, ER diagrams), so they render on GitHub and diff cleanly.
- **README:** follows SPEC §13.3. The live demo link and the 60-second tour come first; the skills map links to exact files.
- **Folder READMEs:** 5–15 lines covering:
  - responsibility
  - what belongs here
  - allowed imports
  - key entry points

## Style

- Write plainly. No marketing adjectives.
- Numbers come from test or eval output, never from estimates.
- Date every status statement, for example: "As of 2026-10-07, recall@5 = …".
