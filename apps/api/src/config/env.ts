import { z } from 'zod';

/** A `postgres://` or `postgresql://` connection string. */
const PostgresUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

/** A Gemini model ID such as `gemini-3.5-flash`. Replay fixtures are keyed by it (SPEC §9.8). */
const ModelIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/, 'must be a Gemini model ID such as gemini-3.5-flash');

/** Model settings shared by the API and `npm run llm:smoke` (SPEC §7.5, §16). */
const geminiModelFields = {
  /** Flash-Lite tier: classification, agent tool selection, simple answers. */
  GEMINI_MODEL_LITE: ModelIdSchema,
  /** Flash tier: synthesis, repair, comparative answers. */
  GEMINI_MODEL_FLASH: ModelIdSchema,
  /** Embedding model (ADR 0007). */
  GEMINI_EMBEDDING_MODEL: ModelIdSchema,
};

/** The Gemini key. An empty value (`GEMINI_API_KEY=` in `.env`) counts as unset. */
const OptionalApiKeySchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

/**
 * Environment variables the API reads at startup. Each phase adds the variables it needs
 * (SPEC §7.5, §16); `.env.example` documents every one.
 */
const EnvSchema = z
  .object({
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
    /** Required in `live` and `record` modes; replay never calls Gemini, so CI has no key (ADR 0016). */
    GEMINI_API_KEY: OptionalApiKeySchema,
    ...geminiModelFields,
    /** Live LLM calls allowed per UTC day across the demo (SPEC §7.5). Enforced from Phase 7. */
    DAILY_LLM_CALL_CAP: z.coerce.number().int().min(0).default(300),
  })
  .superRefine((env, context) => {
    if (env.LLM_MODE !== 'replay' && env.GEMINI_API_KEY === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: `required when LLM_MODE is ${env.LLM_MODE}`,
      });
    }
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

/** Variables `npm run llm:smoke` reads. It always calls Gemini live, so the key is required. */
const SmokeEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  ...geminiModelFields,
});

/** Parsed, validated environment for `npm run llm:smoke`. */
export type SmokeEnv = z.infer<typeof SmokeEnvSchema>;

/** How the seed CLI talks to Gemini; the `--mode` flag picks it, not `LLM_MODE`. */
export type SeedMode = 'replay' | 'record' | 'live';

/**
 * Variables `npm run seed` reads. It connects as the owner (`DATABASE_MIGRATION_URL`, SPEC §16),
 * because `--reset` deletes candidates and the runtime role can't. The key is checked against
 * the mode in {@link parseSeedEnv}.
 */
const SeedEnvSchema = z.object({
  DATABASE_MIGRATION_URL: PostgresUrlSchema,
  GEMINI_API_KEY: OptionalApiKeySchema,
  ...geminiModelFields,
});

/** Parsed, validated environment for `npm run seed`. */
export type SeedEnv = z.infer<typeof SeedEnvSchema>;

type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Parses and validates the environment, so a misconfigured deploy fails at startup
 * with a readable message instead of at the first request.
 *
 * @param source - usually `process.env`; tests pass a plain object.
 * @throws Error listing every invalid variable. Values are never echoed, because some are secrets.
 *
 * @example
 * parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5433/db', GEMINI_MODEL_LITE: 'gemini-3.5-flash-lite', … });
 * // { LLM_MODE: 'replay', GIT_SHA: 'local', PORT: 3000, DAILY_LLM_CALL_CAP: 300, … }
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

/**
 * Parses the smoke CLI's environment: the Gemini key and the three model IDs.
 *
 * @throws Error naming each invalid variable, without its value.
 *
 * @example
 * parseSmokeEnv(process.env);
 */
export function parseSmokeEnv(source: EnvSource): SmokeEnv {
  return parseWith(SmokeEnvSchema, source);
}

/**
 * Parses the seed CLI's environment. Replay needs no key; record and live do.
 *
 * @throws Error naming each invalid variable, without its value.
 *
 * @example
 * parseSeedEnv(process.env, 'replay');
 */
export function parseSeedEnv(source: EnvSource, mode: SeedMode): SeedEnv {
  const env = parseWith(SeedEnvSchema, source);
  if (mode !== 'replay' && env.GEMINI_API_KEY === undefined) {
    throw new Error(
      `Invalid environment configuration:\n  - GEMINI_API_KEY: required when seeding in ${mode} mode`,
    );
  }
  return env;
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
