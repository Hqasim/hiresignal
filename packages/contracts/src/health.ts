import { z } from 'zod';

/** Which LLM adapter the API is running with (SPEC §9.8). */
export const LlmModeSchema = z.enum(['live', 'record', 'replay']);
export type LlmMode = z.infer<typeof LlmModeSchema>;

/**
 * Database reachability as seen by the API.
 * `unchecked` means the API has no database wired yet (Phase 0); Phase 1 replaces it with a real ping.
 */
export const DbStatusSchema = z.enum(['up', 'down', 'unchecked']);
export type DbStatus = z.infer<typeof DbStatusSchema>;

/**
 * Response of `GET /api/health`.
 * `status` is `ok` when the API can serve requests and `degraded` when a dependency (the database) is down.
 */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: DbStatusSchema,
  llmMode: LlmModeSchema,
  gitSha: z.string().min(1),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
