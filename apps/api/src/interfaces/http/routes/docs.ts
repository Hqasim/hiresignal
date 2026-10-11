import { createHash } from 'node:crypto';

import { Hono } from 'hono';

import type { AppBindings } from '../app-bindings';
import { buildOpenApiDocument } from '../openapi/openapi-document';

/**
 * Swagger UI from jsDelivr, pinned to an exact version with Subresource Integrity, so the page
 * runs only the bytes that were reviewed. 5.33.0 was published 2026-09-16; the hashes are of the
 * files in its npm tarball (checked identical to jsDelivr's copies on 2026-10-11).
 */
export const SWAGGER_UI = {
  version: '5.33.0',
  css: {
    url: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0/swagger-ui.css',
    integrity: 'sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW',
  },
  js: {
    url: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0/swagger-ui-bundle.js',
    integrity: 'sha384-YDALVcy8kj8yltLBVi1vBiBAUqdxvus673gM8XKwiy6aDUJFXivF/KCufekjYbVf',
  },
} as const;

/** The one inline script: it points Swagger UI at the document on the same origin. */
const INIT_SCRIPT =
  "window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true });";

const DOCS_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HireSignal API</title>
    <link rel="stylesheet" href="${SWAGGER_UI.css.url}" integrity="${SWAGGER_UI.css.integrity}" crossorigin="anonymous" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI.js.url}" integrity="${SWAGGER_UI.js.integrity}" crossorigin="anonymous"></script>
    <script>${INIT_SCRIPT}</script>
  </body>
</html>
`;

/**
 * Allows the pinned CDN files, the inline init script by hash, and fetches to this origin only.
 * Swagger UI sets inline styles, so styles also allow `'unsafe-inline'`.
 */
const DOCS_CSP = [
  "default-src 'none'",
  `script-src https://cdn.jsdelivr.net 'sha256-${createHash('sha256').update(INIT_SCRIPT).digest('base64')}'`,
  "style-src https://cdn.jsdelivr.net 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * API documentation routes (SPEC §10, ADR 0021):
 *
 * - `GET /openapi.json`: the OpenAPI 3.1 document, built from the contracts once per process.
 * - `GET /docs`: Swagger UI for that document.
 */
export function docsRoutes(): Hono<AppBindings> {
  // Built and serialized on the first request, then reused for the life of the process.
  let document: string | null = null;
  return new Hono<AppBindings>()
    .get('/openapi.json', (c) => {
      document ??= JSON.stringify(buildOpenApiDocument());
      return c.body(document, 200, { 'content-type': 'application/json' });
    })
    .get('/docs', (c) => {
      c.header('content-security-policy', DOCS_CSP);
      return c.html(DOCS_PAGE);
    });
}
