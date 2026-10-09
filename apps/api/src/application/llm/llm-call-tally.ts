import type { LlmCallRecord, LlmCallRepository } from '../ports/llm-call-repository';

/** Counts of the call attempts one run made, for the seed CLI's summary. */
export interface LlmCallTally {
  attempts: number;
  /** Attempts that reached Gemini (`record` and `live` modes). */
  live: number;
  /**
   * Attempts made on the fallback tier. In record mode this matters: the fixture is saved under
   * the fallback model, so replay (which routes to the default tier) won't find it.
   */
  fallbacks: number;
  /** Attempts that ended in an error, rate limit or timeout. */
  failed: number;
}

/**
 * Wraps the call log so a CLI run can report how many attempts it made, without querying
 * `llm_calls` (which also holds other runs). Every record still reaches `inner`.
 *
 * @example
 * const { calls, tally } = withCallTally(createPgLlmCallRepository(pool));
 * // … run …
 * tally(); // { attempts: 17, live: 17, fallbacks: 0, failed: 0 }
 */
export function withCallTally(inner: LlmCallRepository): {
  calls: LlmCallRepository;
  tally: () => LlmCallTally;
} {
  const counts: LlmCallTally = { attempts: 0, live: 0, fallbacks: 0, failed: 0 };
  const count = (call: LlmCallRecord): void => {
    counts.attempts += 1;
    counts.live += call.source === 'live' ? 1 : 0;
    counts.fallbacks += call.isFallback ? 1 : 0;
    counts.failed += call.status === 'ok' ? 0 : 1;
  };
  return {
    calls: {
      async record(call: LlmCallRecord): Promise<void> {
        count(call);
        await inner.record(call);
      },
      countLiveSince: (since) => inner.countLiveSince(since),
    },
    tally: () => ({ ...counts }),
  };
}
