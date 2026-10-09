# 0020. Evidence-gathering agent with a separate synthesis call

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

A scorecard needs evidence for seven requirements from one resume. There are three ways to get the evidence to the model:

- send the whole resume
- retrieve chunks for each requirement in fixed code
- let a model decide what to read

The project also has to show agentic tool use done safely (SPEC §5): bounded, read-only, traceable, and resistant to an injected resume (LLM06, excessive agency).

Gemini 3 complicates multi-turn tool use. The model's own turns carry thought signatures and must be sent back unchanged, so the history belongs to the model that produced it.

## Decision

Screening runs in **two stages**, both behind the same cacheable prefix (ADR 0011).

**Stage 1, the agent** ([`runScreeningAgent`](../../apps/api/src/application/screening/run-screening-agent.ts), task `screen.agent`, routed to Flash-Lite):

- **Opening turn:** the candidate's alias and a spotlighted outline: each chunk's ref and context header, never its content.
- **Tools:** two read-only tools ([`createScreeningTools`](../../apps/api/src/application/screening/screening-tools.ts)), both fixed to one candidate of one job by the use case. No argument can widen that scope.
  - `search_resume(query, requirementId)` embeds the query (`embedQuery`) and runs hybrid search filtered to the candidate, returning `AGENT_SEARCH_TOP_K` chunks.
  - `read_section(section)` returns one of the candidate's sections; any other name gets an error that lists the valid ones.
- **Arguments** are Zod-validated. A bad call gets an error response the model can recover from; it never throws. The `requirementId` enum and the query length cap (`SEARCH_QUERY_MAX_CHARS`) keep calls focused.
- **History:** parallel calls run in order. Their results go back in one tool turn, after the model's own turn appended unchanged.
- **Scores stay out of the prompt:** results hold refs and spotlighted chunk text, never similarity scores, so the conversation and its fixture keys depend only on which chunks were found.
- **Stopping:** at a turn without tool calls, or after `MAX_AGENT_STEPS` (8) turns. Calls on the last allowed turn still run, but nothing more is sent.
- **Trace:** each tool call records its step, arguments, returned refs and latency, and the turn's tokens sit on its first call. Never resume text. The trace is stored with the scorecard.

**Stage 2, synthesis** ([`createScreenCandidate`](../../apps/api/src/application/screening/screen-candidate.ts), task `screen.synthesize`, routed to Flash): a **fresh** conversation with the same prefix and the evidence set. The evidence set is every chunk the agent retrieved, deduplicated and in resume order, each ref outside an `<untrusted_resume_chunk>` wrapper. The model answers with the `ScorecardDraft` schema. Verification, the one repair call and scoring follow (ADR 0012).

## Consequences

- **Positive:**
  - **Least privilege by construction.** The agent can only read one candidate's chunks. There is no write tool and no tool that reaches another candidate, so even a fully hijacked agent can, at worst, read the resume it is already screening.
  - **Citations are bounded by what was retrieved.** The evidence set is the agent's reads, so the judge can't cite text the trace doesn't show being found, and a reviewer can follow each citation back to the search that surfaced it.
  - **Cheap and judged separately.** Tool selection runs on Flash-Lite with short outputs. The judgment runs once on Flash, without the agent's history, so the judge sees the evidence, not the agent's reasoning about it.
  - **Replay stays simple.** The fresh synthesis conversation has no thought signatures from another model. Each stage's requests are reproducible from the database state, so replay is deterministic.
- **Negative:**
  - **Recall depends on the agent.** Evidence the agent never searched for can't be cited. A requirement it skipped ends as `none` or `unclear` even if the resume supports it. The worked examples teach it to search for every requirement, and the trace shows what it did.
  - **More calls than a single prompt.** A screening takes 3–8 agent turns and their query embeddings plus 1–2 synthesis calls. Seeding is precomputed (ADR 0015), and the live re-screen is capped.
  - **Live latency.** On Lambda, a live re-screen must fit the 60 s timeout. Agent turns are short, but a slow Flash synthesis plus a repair could approach it.

## Alternatives considered

- **Send the whole resume to one structured call.** Rejected: simplest and cheapest, but it shows no retrieval or tool use. Every quote's search space becomes the whole document, and the model sees all of a resume's injected text at once. With these short resumes it would work; it doesn't scale to long documents or demonstrate the skill.
- **Deterministic retrieval:** one hybrid search per requirement in code, then synthesis. Rejected: robust and cheaper, but the search query would be the requirement text itself, which misses evidence phrased differently (C05's projects), and there's no agent to show. It remains a sensible fallback if the agent's recall disappoints in evals.
- **One conversation for both stages** (the agent writes the scorecard at the end). Rejected: the judge would be the cheap tool-selection model, or the whole loop would run on Flash. The scorecard would also inherit a long tool history full of untrusted text, and thought signatures would tie it to one model.
- **Agent tools over the whole talent pool.** Rejected: unnecessary for scoring one candidate. It would let an injected resume steer the agent toward other candidates' text and break the per-candidate evidence boundary.
