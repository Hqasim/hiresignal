import { z } from 'zod';

import type { LlmCallRecord, LlmCallRepository } from '../../application/ports/llm-call-repository';
import type { Queryable } from './create-pool';
import { queryRows } from './query-rows';

const CountRowSchema = z.object({ count: z.number().int().nonnegative() });

/**
 * {@link LlmCallRepository} on Postgres.
 *
 * @example
 * const calls = createPgLlmCallRepository(pool);
 * const usedToday = await calls.countLiveSince(startOfUtcDay);
 */
export function createPgLlmCallRepository(db: Queryable): LlmCallRepository {
  return {
    async record(call: LlmCallRecord): Promise<void> {
      await db.query(
        `insert into llm_calls (request_id, task, model, tier, routed_reason, is_fallback, source,
                                status, input_tokens, output_tokens, cached_tokens, latency_ms,
                                prompt_version, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          call.requestId,
          call.task,
          call.model,
          call.tier,
          call.routedReason,
          call.isFallback,
          call.source,
          call.status,
          call.inputTokens,
          call.outputTokens,
          call.cachedTokens,
          call.latencyMs,
          call.promptVersion,
          call.createdAt,
        ],
      );
    },

    async countLiveSince(since: Date): Promise<number> {
      // Served by llm_calls_created_at; count(*) is bigint, so cast it to arrive as a number.
      const [row] = await queryRows(
        db,
        `select count(*)::int as count from llm_calls where source = 'live' and created_at >= $1`,
        [since],
        CountRowSchema,
      );
      return row?.count ?? 0;
    },
  };
}
