import { describe, expect, it } from 'vitest';

import { aTestApp } from '../../../../test/helpers/test-app';
import { SWAGGER_UI } from '../routes/docs';
import {
  buildOpenApiDocument,
  type JsonValue,
  OPERATIONS,
  toOpenApiPath,
} from './openapi-document';

const DOCS_ROUTES = ['GET /api/openapi.json', 'GET /api/docs'];

interface Doc {
  openapi: string;
  paths: Record<string, Record<string, Record<string, JsonValue>>>;
  components: Record<string, Record<string, JsonValue>>;
}

function documentFrom(json: unknown): Doc {
  return json as Doc;
}

/** Every `$ref` string anywhere in a JSON value. */
function refsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refsIn);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      key === '$ref' && typeof child === 'string' ? [child] : refsIn(child),
    );
  }
  return [];
}

describe('OpenAPI document', () => {
  it('documents exactly the routes the app serves, apart from the docs themselves', async () => {
    const { app } = await aTestApp();
    const served = new Set(
      app.routes
        .filter((route) => route.method !== 'ALL')
        .map((route) => `${route.method} ${route.path}`)
        .filter((route) => !DOCS_ROUTES.includes(route)),
    );
    const doc = documentFrom(buildOpenApiDocument());
    const documented = Object.entries(doc.paths).flatMap(([path, operations]) =>
      Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(documented.sort()).toEqual([...served].map(toOpenApiRoute).sort());
    expect(OPERATIONS).toHaveLength(served.size);
  });

  it('is OpenAPI 3.1, and every $ref resolves inside the document', () => {
    const doc = documentFrom(buildOpenApiDocument());

    expect(doc.openapi).toMatch(/^3\.1\.\d+$/);
    const unresolved = refsIn(doc).filter((target) => {
      const [, kind, name] = /^#\/components\/(\w+)\/(\w+)$/.exec(target) ?? [];
      return kind === undefined || name === undefined || doc.components[kind]?.[name] === undefined;
    });
    expect(unresolved).toEqual([]);
  });

  it('describes request and response bodies with the contracts, without per-schema dialects', () => {
    const doc = documentFrom(buildOpenApiDocument());
    const ask = doc.paths['/api/jobs/{slug}/ask']?.post;

    expect(ask?.requestBody).toEqual({
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/AskRequest' } } },
    });
    expect(doc.components.schemas?.AskRequest).toMatchObject({
      type: 'object',
      properties: { question: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['question'],
    });
    expect(JSON.stringify(doc.components.schemas)).not.toContain('$schema');
  });

  it('documents path and limit parameters from the contracts', () => {
    const doc = documentFrom(buildOpenApiDocument());

    expect(doc.paths['/api/ops/calls']?.get?.parameters).toEqual([
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { default: 50, type: 'integer', minimum: 1, maximum: 100 },
      },
    ]);
    expect(doc.paths['/api/candidates/{id}']?.get?.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]);
  });

  it('documents errors as problem+json, and the 429 with Retry-After', () => {
    const doc = documentFrom(buildOpenApiDocument());
    const askResponses = doc.paths['/api/jobs/{slug}/ask']?.post?.responses;

    expect(Object.keys(askResponses ?? {})).toEqual([
      '200',
      '400',
      '404',
      '413',
      '422',
      '429',
      '500',
      '502',
      '503',
    ]);
    expect(doc.components.responses?.QuotaExceeded).toMatchObject({
      headers: { 'Retry-After': expect.anything() as unknown },
      content: {
        'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
      },
    });
  });
});

describe('GET /api/openapi.json', () => {
  it('serves the document as JSON', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/openapi.json');

    expect(response.status).toBe(200);
    expect(documentFrom(await response.json())).toEqual(buildOpenApiDocument());
  });
});

describe('GET /api/docs', () => {
  it('serves Swagger UI pinned to an exact version with integrity hashes, under a strict CSP', async () => {
    const { app } = await aTestApp();

    const response = await app.request('/api/docs');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/html/);
    expect(html).toContain(`src="${SWAGGER_UI.js.url}" integrity="${SWAGGER_UI.js.integrity}"`);
    expect(html).toContain(`href="${SWAGGER_UI.css.url}" integrity="${SWAGGER_UI.css.integrity}"`);
    expect(SWAGGER_UI.js.url).toContain(`swagger-ui-dist@${SWAGGER_UI.version}/`);
    expect(html).toContain("url: '/api/openapi.json'");
    expect(response.headers.get('content-security-policy')).toMatch(
      /default-src 'none'; script-src https:\/\/cdn\.jsdelivr\.net 'sha256-[A-Za-z0-9+/]+=*'/,
    );
  });
});

function toOpenApiRoute(route: string): string {
  const [method = '', path = ''] = route.split(' ');
  return `${method} ${toOpenApiPath(path)}`;
}
