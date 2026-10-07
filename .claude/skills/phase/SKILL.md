---
name: phase
description: Plan and implement one HireSignal delivery phase from docs/SPEC.md §20, following the .claude/CLAUDE.md workflow. Use as /phase <number>.
disable-model-invocation: true
---

Run Phase $ARGUMENTS of HireSignal.

1. **Read first.**
   - Read `docs/PROGRESS.md`, then Phase $ARGUMENTS in `docs/SPEC.md` §20 and every section it references.
   - Confirm the previous phase is marked done (skip for Phase 0). If it isn't, tell me what's missing and stop.
   - For Phase 0, check the toolchain first (`node -v` is v24.21.0, `npm -v` is 11.19.0 or newer, `docker`, `aws`, `sam`, `gh auth status`) and list anything missing.
2. **Plan; don't edit files yet.** Present:
   - the goal in one sentence
   - ordered steps, each a small committable unit, with the files it touches and the tests that prove it
   - which decisions need an ADR
   - anything I must do by hand (accounts, secrets, commands that need live keys), with exact copy-paste commands for Windows PowerShell
   - risks and open questions
3. **Build.** Once I approve, execute the steps in order. After each step:
   - run `npm run verify` and fix every failure
   - commit with a Conventional Commit message
4. **Prove the Definition of Done.** Check every item of the phase's DoD and show the evidence: command output, test counts, URLs. If an item needs CI or a deploy, ask me to approve the push first, then watch the run with `gh run watch`.
5. **Hand off.** Update `docs/PROGRESS.md` (done, decisions with ADR links, deferred items, known issues). Then give me:
   - what changed
   - how to verify it by hand
   - what was deferred
   - the suggested prompt for the next session

   Then stop and wait.
