# 0011. Prompt caching via byte-stable prefixes

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Screening one candidate makes up to eight `screen.agent` calls, one `screen.synthesize` call and sometimes a `screen.repair` call (SPEC §9.6). Every one of them needs the same long instructions: the rubric and its definitions, the evidence rules, the untrusted-content policy, the fairness rules, the job with its requirements, and worked examples. Re-sending those thousands of tokens on every call is the bulk of the input.

Gemini offers two kinds of caching:

- **Explicit context caching** creates a cache object with a TTL, which the caller has to create, reference, refresh and delete.
- **Implicit caching** applies automatically when a request starts with the same bytes as a recent one and that prefix is above the model's minimum. Google's caching page (checked 2026-10-09) lists 4,096 tokens for Gemini 3.5 Flash. It doesn't list Flash-Lite.

On the free tier there is no bill to cut, but cached tokens still show up in the usage metadata (`cachedContentTokenCount`), they lower latency, and the same design would cut cost on a paid key. The ops page reports the cache ratio (SPEC §9.2).

## Decision

One builder, [`buildScreeningPrefix`](../../apps/api/src/application/prompts/screening-prefix.ts), produces the system instruction for **every** screening call of a job: the agent turns, the synthesis and the repair. It contains, in order:

1. role and the two-stage task
2. evidence rules
3. the rubric
4. the untrusted-content policy
5. fairness rules
6. the job and its requirements
7. two worked examples about a fictional candidate, `X01`, against a fictional rubric (`E1`–`E5`)
8. the output contracts for both stages

It holds nothing that varies by candidate, request or time: no alias, id, date or retrieved text. Everything variable (the alias, the spotlighted outline, tool results, the evidence set) comes after it, in the conversation. The agent's tool declarations depend only on the job's requirement ids, so they are identical for every candidate too.

[`screening-prefix.test.ts`](../../apps/api/src/application/prompts/screening-prefix.test.ts) enforces this:

- the prefix is byte-identical when rebuilt
- it contains no alias pattern, uuid or ISO date
- its estimated size is at least `CACHE_MIN_PREFIX_TOKENS × (1 + CACHE_PREFIX_MARGIN)` = 4,506 tokens; as built it is 5,239

The worked examples are what make the prefix long. They are there because they teach the method: batching searches, ignoring an injected note, the skills-list rule, and the exact citation format. They also show the mistakes software rejects. Padding would have reached the size more cheaply, but it adds nothing for the model, so the size comes from content.

`SCREENING_PROMPT_VERSION` (`screening@1`) covers the prefix and the turns built on it, and is stored on every scorecard and call. Any edit bumps it and needs a re-recording, because fixture keys include the full request (ADR 0009).

## Consequences

- **Positive:**
  - No cache lifecycle: nothing to create, refresh, expire or clean up, and nothing extra to mock in tests.
  - The same prefix works for any job. The examples use their own rubric, so the builder only swaps in section 6.
  - Sharing one system instruction between the agent and synthesis also keeps their rules identical: the agent searches with the same rubric the judge applies.
- **Negative:**
  - Implicit caching is best-effort. A hit isn't guaranteed, and Google doesn't document a minimum for Flash-Lite, where the agent runs. The ops page reports the measured ratio, including zero if that is what the logs show.
  - The agent and the judge run on different models (Flash-Lite and Flash), and caches are per model, so the prefix is cached twice at best.
  - A 5,000-token prefix costs input tokens on every call even when the cache misses. For an eight-candidate seed that's about 50 calls × 5,000 tokens.
  - Any prompt edit, even a typo fix, changes every screening fixture key and needs `npm run seed:record`.

## Alternatives considered

- **Explicit context caching** (`caches.create` with a TTL). Rejected: it adds a cache object to create, refresh and delete, a failure mode when it expires mid-run, and storage limits to manage, all for a demo that screens eight resumes. It is the better choice for a long job description shared by thousands of screenings (SPEC §22).
- **A short system prompt, with the job and rubric in the first user turn.** Rejected: the job would then follow the candidate-specific turn in some calls and precede it in others, which breaks the shared prefix, and the instructions would read as data next to untrusted text.
- **Separate prompts for the agent and the synthesis.** Rejected: two prefixes halve the chance of a hit within each model's traffic, and two copies of the rubric can drift apart.
- **No caching design at all.** Rejected: it is cheap to get right once, the byte-stability test also protects reproducible fixtures, and the cache ratio is a useful operational signal.
