import { nextUtcMidnight, startOfUtcDay } from '../../domain/quota/utc-day';
import { QuotaExceededError } from '../errors/quota-exceeded-error';
import type { Clock } from '../ports/clock';
import type { LlmCallRepository } from '../ports/llm-call-repository';

/** Dependencies of {@link createCheckDailyCap}. */
export interface CheckDailyCapDeps {
  calls: LlmCallRepository;
  clock: Clock;
  /** `DAILY_LLM_CALL_CAP`: live calls allowed per UTC day across the demo. */
  cap: number;
}

/** Resolves when another live LLM request may start; throws when the day's cap is used up. */
export type CheckDailyCap = () => Promise<void>;

/**
 * Guards the free Gemini key (SPEC §10, ADR 0015, LLM10): counts today's `live` calls in
 * `llm_calls` and refuses new LLM work once they reach the cap. Replayed calls don't count. The
 * check runs before a request starts, so one request that makes several calls may finish slightly
 * over the cap; the next one is refused.
 *
 * @throws QuotaExceededError with the seconds until the next UTC midnight.
 *
 * @example
 * const check = createCheckDailyCap({ calls, clock, cap: 300 });
 * await check(); // throws QuotaExceededError on call 301 of the day
 */
export function createCheckDailyCap(deps: CheckDailyCapDeps): CheckDailyCap {
  return async () => {
    const now = deps.clock.now();
    const used = await deps.calls.countLiveSince(startOfUtcDay(now));
    if (used < deps.cap) {
      return;
    }
    const retryAfterSeconds = Math.ceil((nextUtcMidnight(now).getTime() - now.getTime()) / 1000);
    throw new QuotaExceededError(
      `Today's live AI quota (${String(deps.cap)} calls) is used up. Precomputed scorecards still work; live requests resume at 00:00 UTC.`,
      retryAfterSeconds,
    );
  };
}
