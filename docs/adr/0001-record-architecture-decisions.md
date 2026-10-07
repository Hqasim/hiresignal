# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

HireSignal is a portfolio project. Reviewers (hiring managers, senior engineers, architects) judge the decisions as much as the code, and most of those decisions can't be read off the code. Examples: why one Lambda, why replay fixtures instead of live calls, why the model never outputs a score. The project is also built across many short sessions with an AI pair programmer, so context has to survive outside anyone's memory.

## Decision

We record every significant or non-obvious decision as an Architecture Decision Record in `docs/adr/`, in Michael Nygard's format:

- Title
- Status
- Date
- Context
- Decision
- Consequences (positive and negative)
- Alternatives considered (at least two, each with why it was rejected)

The rules:

- One decision per record.
- Files are named `NNNN-kebab-title.md`, and [`docs/adr/README.md`](README.md) indexes them.
- An accepted ADR is never rewritten. A new ADR supersedes it, and both link to each other.
- The `/adr <title>` Claude Code skill (`.claude/skills/adr/SKILL.md`) creates the next one.
- A change of direction updates `docs/SPEC.md` and adds an ADR in the same commit.

## Consequences

- **Positive:** reviewers can audit reasoning without asking. Future sessions don't reopen settled questions. Every trade-off names what was rejected.
- **Positive:** it forces a pause before non-obvious choices, which catches weak ones early.
- **Negative:** each decision costs a few minutes of writing, and records can drift from the code if they aren't linked to the paths they govern.

## Alternatives considered

- **Decisions in the spec only.** Rejected: the spec describes the target state, not the reasoning or the options that lost. It also changes over time, which erases the history of why.
- **Commit messages and PR descriptions.** Rejected: they're scattered, hard to find later, and invisible to someone skimming the repo.
- **A wiki outside the repo.** Rejected: it drifts from the code, isn't reviewed with changes, and the people evaluating the project may never see it.
