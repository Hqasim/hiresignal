import { z } from 'zod';

/**
 * Environment variables the API reads at startup. Each phase adds the variables it needs
 * (SPEC §7.5, §16); `.env.example` documents every one.
 */
const EnvSchema = z.object({
  /** Which LLM adapter to run: `live` in production, `record` locally, `replay` in tests and CI (SPEC §9.8). */
  LLM_MODE: z.enum(['live', 'record', 'replay']).default('replay'),
  /** Commit the running build came from, reported by `GET /api/health`. CI passes the real SHA. */
  GIT_SHA: z.string().min(1).default('local'),
  /** Port for the local Node server. Lambda ignores it. */
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

/** Parsed, validated environment. */
export type Env = z.infer<typeof EnvSchema>;

/**
 * Parses and validates the environment, so a misconfigured deploy fails at startup
 * with a readable message instead of at the first request.
 *
 * @param source - usually `process.env`; tests pass a plain object.
 * @throws Error listing every invalid variable. Values are never echoed, because some are secrets.
 *
 * @example
 * parseEnv({ LLM_MODE: 'live', GIT_SHA: 'abc1234' }); // { LLM_MODE: 'live', GIT_SHA: 'abc1234', PORT: 3000 }
 */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}
