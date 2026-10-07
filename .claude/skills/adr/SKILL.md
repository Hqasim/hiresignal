---
name: adr
description: Write the next Architecture Decision Record in docs/adr using the project format. Use as /adr <short title>.
disable-model-invocation: true
---

Create the next ADR for: $ARGUMENTS

1. Find the highest number in `docs/adr/` and use the next one, zero-padded to 4 digits.
2. Write `docs/adr/NNNN-<kebab-title>.md` with these sections:
   - Title
   - Status (Accepted)
   - Date (today)
   - Context
   - Decision
   - Consequences (positive and negative)
   - Alternatives considered (at least two, each with why it was rejected)
3. Describe what we actually built, not what we might build. Link to the code paths the decision governs.
4. Add the ADR to the index in `docs/adr/README.md`, then commit as `docs(adr): NNNN <title>`.
