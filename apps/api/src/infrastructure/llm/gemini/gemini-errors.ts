import { ApiError } from '@google/genai';
import { z } from 'zod';

import { LlmCallError } from '../../../application/llm/llm-call-error';
import type { EmbeddingTask, LlmTask } from '../../../domain/routing/llm-task';

/** HTTP statuses that mean "the provider is struggling, try again". */
const UNAVAILABLE_STATUSES = new Set([500, 502, 503, 504]);

/**
 * The part of a Gemini error body we read. A 429 carries a `google.rpc.RetryInfo` detail with
 * `retryDelay` such as `"37s"`; the SDK's `ApiError` keeps the body as its JSON `message` and
 * drops response headers, so there is no `Retry-After` header to read.
 */
const ErrorBodySchema = z.object({
  error: z.object({
    details: z
      .array(z.object({ '@type': z.string().optional(), retryDelay: z.string().optional() }))
      .optional(),
  }),
});

const RETRY_DELAY = /^(\d+(?:\.\d+)?)s$/;
const MS_PER_SECOND = 1000;

/**
 * Translates whatever the Gemini SDK threw into a provider-neutral {@link LlmCallError}, so the
 * retry and fallback decorators never see SDK types. The message names the status and task only;
 * the provider's body stays in `cause`, which callers don't render.
 *
 * @example
 * try { await models.generateContent(params); } catch (error) { throw toLlmCallError(error, task); }
 */
export function toLlmCallError(error: unknown, task: LlmTask | EmbeddingTask): LlmCallError {
  if (error instanceof ApiError) {
    const message = `Gemini returned HTTP ${String(error.status)} for ${task}`;
    if (error.status === 429) {
      const retryAfterMs = parseRetryDelayMs(error.message);
      return new LlmCallError(message, {
        reason: 'rate_limited',
        task,
        cause: error,
        ...(retryAfterMs !== undefined && { retryAfterMs }),
      });
    }
    if (error.status === 408) {
      return new LlmCallError(message, { reason: 'timeout', task, cause: error });
    }
    const reason = UNAVAILABLE_STATUSES.has(error.status) ? 'unavailable' : 'rejected';
    return new LlmCallError(message, { reason, task, cause: error });
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new LlmCallError(`Gemini timed out for ${task}`, {
      reason: 'timeout',
      task,
      cause: error,
    });
  }
  // fetch rejects with a TypeError when the network fails before any HTTP response.
  if (error instanceof TypeError) {
    return new LlmCallError(`Gemini was unreachable for ${task}`, {
      reason: 'unavailable',
      task,
      cause: error,
    });
  }
  return new LlmCallError(`Gemini call failed for ${task}`, {
    reason: 'rejected',
    task,
    cause: error,
  });
}

function parseRetryDelayMs(body: string): number | undefined {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return undefined;
  }
  const parsed = ErrorBodySchema.safeParse(json);
  if (!parsed.success) {
    return undefined;
  }
  const retryInfo = parsed.data.error.details?.find((detail) =>
    detail['@type']?.endsWith('google.rpc.RetryInfo'),
  );
  const seconds = RETRY_DELAY.exec(retryInfo?.retryDelay ?? '')?.[1];
  return seconds === undefined ? undefined : Math.round(Number(seconds) * MS_PER_SECOND);
}
