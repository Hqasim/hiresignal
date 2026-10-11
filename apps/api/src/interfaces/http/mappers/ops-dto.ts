import type { LlmCallRow, OpsSummary } from '@hiresignal/contracts';

import type { OpsSummaryReport } from '../../../application/ops/get-ops-summary';
import type { StoredLlmCall } from '../../../application/ports/llm-call-repository';

/**
 * Maps the ops report to `GET /api/ops/summary`. Dates become ISO strings; `day` is the UTC
 * calendar date.
 *
 * @example
 * toOpsSummary(report).cap; // { used: 12, limit: 300, resetsAt: '2026-10-12T00:00:00.000Z' }
 */
export function toOpsSummary(report: OpsSummaryReport): OpsSummary {
  return {
    day: report.day.toISOString().slice(0, 'YYYY-MM-DD'.length),
    generatedAt: report.generatedAt.toISOString(),
    cap: {
      used: report.cap.used,
      limit: report.cap.limit,
      resetsAt: report.cap.resetsAt.toISOString(),
    },
    totals: report.calls.totals,
    byModel: report.calls.byModel,
    routeMix: report.calls.routeMix,
  };
}

/**
 * Maps one stored call attempt to its ops row, field by field, so nothing beyond the contract's
 * metadata can reach the response.
 *
 * @example
 * toLlmCallRow(call); // { id: 7, task: 'ask.answer', model: '…', latencyMs: 640, … }
 */
export function toLlmCallRow(call: StoredLlmCall): LlmCallRow {
  return {
    id: call.id,
    requestId: call.requestId,
    task: call.task,
    model: call.model,
    tier: call.tier,
    routedReason: call.routedReason,
    isFallback: call.isFallback,
    source: call.source,
    status: call.status,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    cachedTokens: call.cachedTokens,
    latencyMs: call.latencyMs,
    promptVersion: call.promptVersion,
    createdAt: call.createdAt.toISOString(),
  };
}
