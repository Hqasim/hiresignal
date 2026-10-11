import type {
  LlmCallRecord,
  LlmCallRepository,
  LlmCallStats,
  LlmCallSummary,
  LlmModelStats,
  LlmRouteCount,
  StoredLlmCall,
} from '../../src/application/ports/llm-call-repository';

/**
 * {@link LlmCallRepository} fake that keeps rows in memory, or fails when `failure` is set.
 * `summary` mirrors the SQL in `pg-llm-call-repository.ts`, including `percentile_cont`'s
 * interpolation, so route tests see the numbers Postgres would return.
 */
export class InMemoryLlmCallRepository implements LlmCallRepository {
  readonly rows: LlmCallRecord[] = [];
  failure: Error | null = null;

  record(call: LlmCallRecord): Promise<void> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.rows.push(call);
    return Promise.resolve();
  }

  countLiveSince(since: Date): Promise<number> {
    return Promise.resolve(
      this.rows.filter((row) => row.source === 'live' && row.createdAt >= since).length,
    );
  }

  summary(since: Date): Promise<LlmCallSummary> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    const window = this.rows.filter((row) => row.createdAt >= since);
    const models = new Map<string, LlmCallRecord[]>();
    const routes = new Map<string, LlmRouteCount>();
    for (const row of window) {
      const key = `${row.tier}\u0000${row.model}`;
      models.set(key, [...(models.get(key) ?? []), row]);
      if (row.tier !== 'embedding') {
        const routeKey = `${row.tier}\u0000${row.routedReason}`;
        const route = routes.get(routeKey) ?? {
          tier: row.tier,
          routedReason: row.routedReason,
          calls: 0,
        };
        routes.set(routeKey, { ...route, calls: route.calls + 1 });
      }
    }
    const byModel: LlmModelStats[] = [...models.values()]
      .map((rows) => ({
        model: rows[0]?.model ?? '',
        tier: rows[0]?.tier ?? 'lite',
        ...stats(rows),
      }))
      .sort((a, b) => compare(a.tier, b.tier) || compare(a.model, b.model));
    const routeMix = [...routes.values()].sort(
      (a, b) =>
        b.calls - a.calls || compare(a.tier, b.tier) || compare(a.routedReason, b.routedReason),
    );
    return Promise.resolve({ totals: stats(window), byModel, routeMix });
  }

  recent(limit: number): Promise<StoredLlmCall[]> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    const stored = this.rows.map((row, index) => ({ ...row, id: index + 1 }));
    return Promise.resolve(
      stored
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
        .slice(0, limit),
    );
  }
}

function stats(rows: readonly LlmCallRecord[]): LlmCallStats {
  const live = rows.filter((row) => row.source === 'live');
  const withUsage = live.filter((row) => row.inputTokens !== null);
  const inputTokens = sum(live.map((row) => row.inputTokens));
  const latencies = live.map((row) => row.latencyMs).sort((a, b) => a - b);
  return {
    calls: rows.length,
    live: live.length,
    replay: rows.length - live.length,
    errors: rows.filter((row) => row.status !== 'ok').length,
    fallbacks: rows.filter((row) => row.isFallback).length,
    inputTokens,
    outputTokens: sum(live.map((row) => row.outputTokens)),
    cachedTokens: sum(live.map((row) => row.cachedTokens)),
    cacheRatio:
      inputTokens === 0 ? null : sum(withUsage.map((row) => row.cachedTokens)) / inputTokens,
    p50LatencyMs: percentileCont(latencies, 0.5),
    p95LatencyMs: percentileCont(latencies, 0.95),
  };
}

function sum(values: readonly (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** Postgres `percentile_cont`: linear interpolation between the two nearest sorted values. */
function percentileCont(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const position = fraction * (sorted.length - 1);
  const lower = sorted[Math.floor(position)] ?? 0;
  const upper = sorted[Math.ceil(position)] ?? lower;
  return lower + (upper - lower) * (position - Math.floor(position));
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
