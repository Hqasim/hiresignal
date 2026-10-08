import type { JsonValue } from '../../../application/llm/json-value';

/**
 * Serializes JSON with object keys sorted at every level and no whitespace, so two requests that
 * differ only in key order produce the same string and therefore the same fixture key
 * (SPEC §9.8). Array order is kept: it is meaningful (turns, batch inputs).
 *
 * @example
 * canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }); // '{"a":[2,{"c":4,"d":3}],"b":1}'
 */
export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key] ?? null)]),
    );
  }
  return value;
}
