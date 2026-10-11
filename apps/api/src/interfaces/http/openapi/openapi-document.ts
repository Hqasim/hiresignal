import {
  AskRequestSchema,
  AskResponseSchema,
  CandidateDetailSchema,
  CandidateIdParamsSchema,
  CandidateListResponseSchema,
  CandidateSummarySchema,
  HealthResponseSchema,
  JobDetailSchema,
  JobListResponseSchema,
  JobSlugParamsSchema,
  limitQuerySchema,
  LlmCallListResponseSchema,
  LlmCallRowSchema,
  LlmCallStatsSchema,
  OpsSummarySchema,
  PROBLEM_CONTENT_TYPE,
  ProblemSchema,
  ScorecardSchema,
  ScreenResponseSchema,
} from '@hiresignal/contracts';
import { z } from 'zod';

/** A JSON value, the shape of the generated document. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

/**
 * Contract schemas published as `components.schemas`, by name. Nested schemas that appear here
 * become `$ref`s; the rest are inlined where they're used.
 */
const COMPONENTS = {
  HealthResponse: HealthResponseSchema,
  JobListResponse: JobListResponseSchema,
  JobDetail: JobDetailSchema,
  CandidateSummary: CandidateSummarySchema,
  CandidateListResponse: CandidateListResponseSchema,
  CandidateDetail: CandidateDetailSchema,
  Scorecard: ScorecardSchema,
  ScreenResponse: ScreenResponseSchema,
  AskRequest: AskRequestSchema,
  AskResponse: AskResponseSchema,
  LlmCallStats: LlmCallStatsSchema,
  OpsSummary: OpsSummarySchema,
  LlmCallRow: LlmCallRowSchema,
  LlmCallListResponse: LlmCallListResponseSchema,
  Problem: ProblemSchema,
} as const;
type ComponentName = keyof typeof COMPONENTS;

/** The error statuses routes answer with, each a `components.responses` entry. */
const PROBLEMS = {
  400: ['BadRequest', 'The path, query or body failed validation (`VALIDATION_FAILED`).'],
  404: ['NotFound', 'No such job, candidate or route (`NOT_FOUND`).'],
  409: ['Conflict', 'A quarantined candidate cannot be screened (`CANDIDATE_QUARANTINED`).'],
  413: ['PayloadTooLarge', 'The body exceeds 16 KB (`PAYLOAD_TOO_LARGE`).'],
  422: ['QuestionRejected', 'The question hides instructions (`INJECTION_REJECTED`).'],
  429: ['QuotaExceeded', "Today's live model calls reached the cap (`QUOTA_EXCEEDED`)."],
  500: ['InternalError', 'A bug or a missing fixture (`INTERNAL_ERROR`, `FIXTURE_MISSING`).'],
  502: ['ModelOutputInvalid', 'The model reply never matched its schema (`LLM_OUTPUT_INVALID`).'],
  503: ['ModelUnavailable', 'The model provider is unavailable (`LLM_UNAVAILABLE`).'],
} as const;
type ProblemStatus = keyof typeof PROBLEMS;

/** One documented operation. `path` uses Hono's `:param` syntax, as `app.routes` lists it. */
export interface OperationSpec {
  method: 'GET' | 'POST';
  path: string;
  tag: 'health' | 'jobs' | 'candidates' | 'ask' | 'ops';
  summary: string;
  description?: string;
  /** Default `?limit=` for list endpoints. */
  limitDefault?: number;
  body?: ComponentName;
  response: ComponentName;
  problems: readonly ProblemStatus[];
}

/** Routes behind the daily cap and model calls can fail in these ways too. */
const LLM_PROBLEMS = [429, 502, 503] as const;

/**
 * Every API operation, in the order the docs page shows them. The contract-coverage test checks
 * this list against the routes the app registers, so the document can't silently drift.
 */
export const OPERATIONS: readonly OperationSpec[] = [
  {
    method: 'GET',
    path: '/api/health',
    tag: 'health',
    summary: 'Liveness, database ping, git SHA and LLM mode',
    description: 'Always 200; a down database is reported as `status: degraded`.',
    response: 'HealthResponse',
    problems: [],
  },
  {
    method: 'GET',
    path: '/api/jobs',
    tag: 'jobs',
    summary: 'List jobs',
    limitDefault: 20,
    response: 'JobListResponse',
    problems: [400],
  },
  {
    method: 'GET',
    path: '/api/jobs/:slug',
    tag: 'jobs',
    summary: 'A job and its rubric',
    response: 'JobDetail',
    problems: [400, 404],
  },
  {
    method: 'GET',
    path: '/api/jobs/:slug/candidates',
    tag: 'jobs',
    summary: 'Ranked candidates, quarantined last, names hidden until shortlisted',
    limitDefault: 50,
    response: 'CandidateListResponse',
    problems: [400, 404],
  },
  {
    method: 'GET',
    path: '/api/candidates/:id',
    tag: 'candidates',
    summary: 'Redacted resume, guard verdict and latest scorecard with citation spans',
    response: 'CandidateDetail',
    problems: [400, 404],
  },
  {
    method: 'POST',
    path: '/api/candidates/:id/shortlist',
    tag: 'candidates',
    summary: 'Shortlist the candidate and reveal the name (idempotent)',
    response: 'CandidateDetail',
    problems: [400, 404],
  },
  {
    method: 'POST',
    path: '/api/candidates/:id/screen',
    tag: 'candidates',
    summary: 'Re-run the screening agent live',
    description: 'Behind the daily cap. A quarantined candidate is refused with 409.',
    response: 'ScreenResponse',
    problems: [400, 404, 409, ...LLM_PROBLEMS],
  },
  {
    method: 'POST',
    path: '/api/jobs/:slug/ask',
    tag: 'ask',
    summary: 'Ask a question across the talent pool',
    description:
      'Hybrid retrieval, then an answer with verified citations or "insufficient evidence". ' +
      'Behind the daily cap. A question that hides instructions is refused with 422.',
    body: 'AskRequest',
    response: 'AskResponse',
    problems: [400, 404, 413, 422, ...LLM_PROBLEMS],
  },
  {
    method: 'GET',
    path: '/api/ops/summary',
    tag: 'ops',
    summary: "Today's model calls against the cap, by model and route (UTC day)",
    response: 'OpsSummary',
    problems: [],
  },
  {
    method: 'GET',
    path: '/api/ops/calls',
    tag: 'ops',
    summary: 'Recent model call attempts, metadata only',
    limitDefault: 50,
    response: 'LlmCallListResponse',
    problems: [400],
  },
];

/** `/api/jobs/:slug` → `/api/jobs/{slug}`. */
export function toOpenApiPath(honoPath: string): string {
  return honoPath.replaceAll(/:([A-Za-z]\w*)/g, '{$1}');
}

/** Path parameter schemas, from the contracts. */
const PATH_PARAMETERS: Record<string, z.ZodType> = {
  slug: JobSlugParamsSchema.shape.slug,
  id: CandidateIdParamsSchema.shape.id,
};

const ref = (name: string, kind: 'schemas' | 'responses'): JsonObject => ({
  $ref: `#/components/${kind}/${name}`,
});

/**
 * A generated schema without its `$schema` and `$id` headers: OpenAPI 3.1 declares the 2020-12
 * dialect once for the whole document, and components are addressed by their key.
 */
function withoutHeaders(schema: object): JsonObject {
  return Object.fromEntries(
    Object.entries(schema as JsonObject).filter(([key]) => key !== '$schema' && key !== '$id'),
  );
}

/** A standalone JSON Schema for a parameter. */
function schemaOf(schema: z.ZodType): JsonObject {
  return withoutHeaders(z.toJSONSchema(schema));
}

function componentSchemas(): JsonObject {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(COMPONENTS)) {
    registry.add(schema, { id });
  }
  const { schemas } = z.toJSONSchema(registry, { uri: (id) => `#/components/schemas/${id}` });
  return Object.fromEntries(
    Object.entries(schemas).map(([id, schema]) => [id, withoutHeaders(schema)]),
  );
}

function problemResponses(): JsonObject {
  return Object.fromEntries(
    Object.entries(PROBLEMS).map(([status, [name, description]]) => [
      name,
      {
        description,
        ...(status === '429' && {
          headers: {
            'Retry-After': {
              description: 'Seconds until the daily cap resets at 00:00 UTC.',
              schema: { type: 'integer', minimum: 0 },
            },
          },
        }),
        content: { [PROBLEM_CONTENT_TYPE]: { schema: ref('Problem', 'schemas') } },
      },
    ]),
  );
}

function operation(spec: OperationSpec): JsonObject {
  const pathParameters = [...spec.path.matchAll(/:([A-Za-z]\w*)/g)].map(([, name = '']) => {
    const schema = PATH_PARAMETERS[name];
    if (schema === undefined) {
      throw new Error(`No contract schema for path parameter :${name}`);
    }
    return { name, in: 'path', required: true, schema: schemaOf(schema) };
  });
  const queryParameters =
    spec.limitDefault === undefined
      ? []
      : [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: schemaOf(limitQuerySchema(spec.limitDefault).shape.limit),
          },
        ];
  const problems = Object.fromEntries(
    // Every response may carry a 500; the rest are the route's own.
    [...new Set<ProblemStatus>([...spec.problems, 500])]
      .sort((a, b) => a - b)
      .map((status) => [String(status), ref(PROBLEMS[status][0], 'responses')]),
  );
  return {
    tags: [spec.tag],
    summary: spec.summary,
    ...(spec.description !== undefined && { description: spec.description }),
    operationId: `${spec.method.toLowerCase()}${toOpenApiPath(spec.path)
      .replaceAll(/[{}]/g, '')
      .split('/')
      .filter((part) => part !== '' && part !== 'api')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')}`,
    ...([...pathParameters, ...queryParameters].length > 0 && {
      parameters: [...pathParameters, ...queryParameters],
    }),
    ...(spec.body !== undefined && {
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref(spec.body, 'schemas') } },
      },
    }),
    responses: {
      '200': {
        description: 'OK',
        content: { 'application/json': { schema: ref(spec.response, 'schemas') } },
      },
      ...problems,
    },
  };
}

/**
 * Builds the OpenAPI 3.1 document for `GET /api/openapi.json` (SPEC §10, ADR 0021). Every
 * schema comes from `@hiresignal/contracts` through `z.toJSONSchema`, the same Zod schemas the
 * routes validate with, so the document can't describe a shape the API doesn't use. Errors are
 * RFC 9457 problems.
 *
 * @example
 * buildOpenApiDocument().paths['/api/jobs/{slug}/ask'].post.requestBody;
 */
export function buildOpenApiDocument(): JsonObject {
  const paths: JsonObject = {};
  for (const spec of OPERATIONS) {
    const path = toOpenApiPath(spec.path);
    const existing = (paths[path] ?? {}) as JsonObject;
    paths[path] = { ...existing, [spec.method.toLowerCase()]: operation(spec) };
  }
  return {
    openapi: '3.1.1',
    info: {
      title: 'HireSignal API',
      version: '1.0.0',
      summary: 'Blind, injection-aware candidate screening on synthetic data.',
      description:
        'Unauthenticated public demo: every resume is synthetic. Errors are RFC 9457 ' +
        '`application/problem+json` with a stable `code` and the `x-request-id` as `requestId`. ' +
        'Request bodies are limited to 16 KB.',
      license: { name: 'MIT', identifier: 'MIT' },
    },
    tags: [
      { name: 'health' },
      { name: 'jobs' },
      { name: 'candidates' },
      { name: 'ask', description: 'RAG across the talent pool' },
      { name: 'ops', description: 'AI telemetry from `llm_calls`, metadata only' },
    ],
    paths,
    components: { schemas: componentSchemas(), responses: problemResponses() },
  };
}
