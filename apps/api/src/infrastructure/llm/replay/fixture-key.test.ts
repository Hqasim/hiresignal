import { describe, expect, it } from 'vitest';

import { routedRequest } from '../../../../test/helpers/llm-builders';
import { canonicalJson } from './canonical-json';
import { embeddingKeyPayload, fixtureKey, generationKeyPayload } from './fixture-key';

const keyOf = (request: ReturnType<typeof routedRequest>) =>
  fixtureKey('generate', request.route.model, generationKeyPayload(request));

describe('canonicalJson', () => {
  it('sorts object keys at every level and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('gives the same string for objects that differ only in key order', () => {
    expect(canonicalJson({ x: 1, y: { p: true, q: null } })).toBe(
      canonicalJson({ y: { q: null, p: true }, x: 1 }),
    );
  });
});

describe('fixtureKey', () => {
  it('is a 64-character sha256 hex digest', () => {
    expect(keyOf(routedRequest())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for the same request built in a different key order', () => {
    const request = routedRequest();
    const reordered = Object.fromEntries(Object.entries(request).reverse()) as typeof request;

    expect(keyOf(reordered)).toBe(keyOf(request));
  });

  it.each([
    [
      'the model',
      { route: { tier: 'lite', model: 'other-model', reason: 'default', isFallback: false } },
    ],
    ['the prompt version', { promptVersion: 'test@2' }],
    ['the system prompt', { system: 'Something else.' }],
    ['the conversation', { contents: [{ role: 'user', text: 'Another question' }] }],
    ['the response schema', { responseSchema: { type: 'object' } }],
    ['the tools', { tools: [{ name: 'read_section', description: 'Reads.', parameters: {} }] }],
    ['the token limit', { maxOutputTokens: 1024 }],
    ['the temperature', { temperature: 0.2 }],
  ] as const)('changes when %s changes', (_label, change) => {
    expect(keyOf(routedRequest(change))).not.toBe(keyOf(routedRequest()));
  });

  it.each([
    ['the request id', { requestId: 'req-42' }],
    ['the routing context', { routingContext: { candidateCount: 9 } }],
    [
      'the tier, reason and fallback flag for the same model',
      { route: { tier: 'flash', model: 'lite-model', reason: 'context-size', isFallback: true } },
    ],
  ] as const)('ignores %s', (_label, change) => {
    expect(keyOf(routedRequest(change))).toBe(keyOf(routedRequest()));
  });

  it('separates generations from embeddings and embedding input formats', () => {
    const texts = ['Led a team'];

    const document = fixtureKey('embed', 'm', embeddingKeyPayload('embed.documents', 'f@1', texts));
    const query = fixtureKey('embed', 'm', embeddingKeyPayload('embed.query', 'f@1', texts));
    const newFormat = fixtureKey(
      'embed',
      'm',
      embeddingKeyPayload('embed.documents', 'f@2', texts),
    );

    expect(new Set([document, query, newFormat]).size).toBe(3);
  });
});
