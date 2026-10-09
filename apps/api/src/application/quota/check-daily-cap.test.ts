import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../../test/fakes/fake-clock';
import { InMemoryLlmCallRepository } from '../../../test/fakes/in-memory-llm-call-repository';
import { QuotaExceededError } from '../errors/quota-exceeded-error';
import type { LlmCallRecord } from '../ports/llm-call-repository';
import { createCheckDailyCap } from './check-daily-cap';

function call(createdAt: string, source: LlmCallRecord['source'] = 'live'): LlmCallRecord {
  return {
    requestId: null,
    task: 'screen.agent',
    model: 'lite-model',
    tier: 'lite',
    routedReason: 'default',
    isFallback: false,
    source,
    status: 'ok',
    inputTokens: 1,
    outputTokens: 1,
    cachedTokens: 0,
    latencyMs: 10,
    promptVersion: 'screening@1',
    createdAt: new Date(createdAt),
  };
}

function setup(now: string, rows: LlmCallRecord[], cap = 2) {
  const calls = new InMemoryLlmCallRepository();
  calls.rows.push(...rows);
  return createCheckDailyCap({ calls, clock: new FakeClock(new Date(now)), cap });
}

describe('createCheckDailyCap', () => {
  it("allows a request while today's live calls are below the cap", async () => {
    const check = setup('2026-10-09T15:00:00Z', [call('2026-10-09T09:00:00Z')]);

    await expect(check()).resolves.toBeUndefined();
  });

  it('refuses once the cap is reached, with the seconds until the next UTC midnight', async () => {
    const check = setup('2026-10-09T23:59:30Z', [
      call('2026-10-09T09:00:00Z'),
      call('2026-10-09T10:00:00Z'),
    ]);

    const error = await check().then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(error).toMatchObject({ httpStatus: 429, code: 'QUOTA_EXCEEDED', retryAfterSeconds: 30 });
  });

  it("starts counting afresh at midnight UTC: yesterday's calls don't count", async () => {
    const check = setup('2026-10-10T00:00:01Z', [
      call('2026-10-09T22:00:00Z'),
      call('2026-10-09T23:59:59Z'),
    ]);

    await expect(check()).resolves.toBeUndefined();
  });

  it('ignores replayed calls, which never reach Gemini', async () => {
    const check = setup('2026-10-09T15:00:00Z', [
      call('2026-10-09T09:00:00Z', 'replay'),
      call('2026-10-09T10:00:00Z', 'replay'),
    ]);

    await expect(check()).resolves.toBeUndefined();
  });

  it('refuses every live request when the cap is 0', async () => {
    const check = setup('2026-10-09T15:00:00Z', [], 0);

    await expect(check()).rejects.toBeInstanceOf(QuotaExceededError);
  });
});
