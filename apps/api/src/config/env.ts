import { z } from 'zod';

/** A `postgres://` or `postgresql://` connection string. */
const PostgresUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

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
  /**
   * Runtime connection as the least-privilege `hiresignal_app` role (Neon's pooled endpoint in
   * production). Required, so a deploy without it fails at cold start rather than on first query.
   */
  DATABASE_URL: PostgresUrlSchema,
});

/** Parsed, validated environment. */
export type Env = z.infer<typeof EnvSchema>;

/** Variables the migration CLI reads. Kept separate so migrating needs no runtime settings. */
const MigrationEnvSchema = z.object({
  /** Connection as the schema owner, on a direct (unpooled) endpoint: the migrator holds a session lock. */
  DATABASE_MIGRATION_URL: PostgresUrlSchema,
});

/** Parsed, validated environment for `npm run db:migrate`. */
export type MigrationEnv = z.infer<typeof MigrationEnvSchema>;

type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Parses and validates the environment, so a misconfigured deploy fails at startup
 * with a readable message instead of at the first request.
 *
 * @param source - usually `process.env`; tests pass a plain object.
 * @throws Error listing every invalid variable. Values are never echoed, because some are secrets.
 *
 * @example
 * parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5433/db' });
 * // { LLM_MODE: 'replay', GIT_SHA: 'local', PORT: 3000, DATABASE_URL: 'postgres://…' }
 */
export function parseEnv(source: EnvSource): Env {
  return parseWith(EnvSchema, source);
}

/**
 * Parses the migration CLI's environment.
 *
 * @throws Error naming each invalid variable, without its value.
 *
 * @example
 * parseMigrationEnv({ DATABASE_MIGRATION_URL: 'postgres://owner:p@localhost:5433/db' });
 */
export function parseMigrationEnv(source: EnvSource): MigrationEnv {
  return parseWith(MigrationEnvSchema, source);
}

function parseWith<T>(schema: z.ZodType<T>, source: EnvSource): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}
