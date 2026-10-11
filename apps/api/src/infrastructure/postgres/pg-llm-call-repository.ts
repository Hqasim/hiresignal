import { z } from 'zod';

import type {
  LlmCallRecord,
  LlmCallRepository,
  LlmCallSummary,
  StoredLlmCall,
} from '../../application/ports/llm-call-repository';
import type { Queryable } from './create-pool';
import {
  CALL_COLUMNS,
  CallRowSchema,
  ModelStatsRowSchema,
  RouteCountRowSchema,
  STATS_COLUMNS,
  StatsRowSchema,
  toModelStats,
  toRouteCount,
  toStats,
  toStoredCall,
} from './pg-llm-call-rows';
import { queryRows } from './query-rows';

const CountRowSchema = z.object({ count: z.number().int().nonnegative() });

/**
 * {@link LlmCallRepository} on Postgres.
 *
 * @example
 * const calls = createPgLlmCallRepository(pool);
 * const usedToday = await calls.countLiveSince(startOfUtcDay);
 * const today = await calls.summary(startOfUtcDay); // the ops page's numbers, computed in SQL
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

    async summary(since: Date): Promise<LlmCallSummary> {
      // Three small aggregates over the same window, all served by llm_calls_created_at.
      const [totals] = await queryRows(
        db,
        `select ${STATS_COLUMNS} from llm_calls where created_at >= $1`,
        [since],
        StatsRowSchema,
      );
      const byModel = await queryRows(
        db,
        `select model, tier, ${STATS_COLUMNS}
         from llm_calls where created_at >= $1
         group by model, tier
         order by tier, model`,
        [since],
        ModelStatsRowSchema,
      );
      const routeMix = await queryRows(
        db,
        `select tier, routed_reason, count(*)::int as calls
         from llm_calls where created_at >= $1 and tier <> 'embedding'
         group by tier, routed_reason
         order by calls desc, tier, routed_reason`,
        [since],
        RouteCountRowSchema,
      );
      if (totals === undefined) {
        // An aggregate without `group by` always returns exactly one row.
        throw new Error('llm_calls summary returned no totals row');
      }
      return {
        totals: toStats(totals),
        byModel: byModel.map(toModelStats),
        routeMix: routeMix.map(toRouteCount),
      };
    },

    async recent(limit: number): Promise<StoredLlmCall[]> {
      // Ids break ties, because one request can log several attempts in the same millisecond.
      const rows = await queryRows(
        db,
        `select ${CALL_COLUMNS} from llm_calls order by created_at desc, id desc limit $1`,
        [limit],
        CallRowSchema,
      );
      return rows.map(toStoredCall);
    },
  };
}
