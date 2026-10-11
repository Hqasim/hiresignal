import { nextUtcMidnight, startOfUtcDay } from '../../domain/quota/utc-day';
import type { Clock } from '../ports/clock';
import type { LlmCallRepository, LlmCallSummary } from '../ports/llm-call-repository';

/** Dependencies of {@link createGetOpsSummary}. */
export interface GetOpsSummaryDeps {
  calls: LlmCallRepository;
  clock: Clock;
  /** `DAILY_LLM_CALL_CAP`, reported next to today's usage. */
  cap: number;
}

/** Today's AI telemetry, with the daily cap's state. */
export interface OpsSummaryReport {
  /** Start of the UTC day the numbers cover. */
  day: Date;
  generatedAt: Date;
  cap: {
    /** Live calls today: the count the daily cap compares with `limit`. */
    used: number;
    limit: number;
    /** The next UTC midnight, when `used` starts again from 0. */
    resetsAt: Date;
  };
  calls: LlmCallSummary;
}

/** Builds the ops summary for the current UTC day. */
export type GetOpsSummary = () => Promise<OpsSummaryReport>;

/**
 * `GET /api/ops/summary` (SPEC §10, §17): today's calls, tokens, cache ratio, latency, fallbacks,
 * errors and route mix, with usage against the daily cap. The day is the cap's UTC day, so the
 * tile "calls today / cap" matches what the cap middleware enforces.
 *
 * @example
 * const report = await createGetOpsSummary({ calls, clock, cap: 300 })();
 * report.cap; // { used: 12, limit: 300, resetsAt: 2026-10-12T00:00:00.000Z }
 */
export function createGetOpsSummary(deps: GetOpsSummaryDeps): GetOpsSummary {
  return async () => {
    const now = deps.clock.now();
    const day = startOfUtcDay(now);
    const calls = await deps.calls.summary(day);
    return {
      day,
      generatedAt: now,
      cap: { used: calls.totals.live, limit: deps.cap, resetsAt: nextUtcMidnight(now) },
      calls,
    };
  };
}
