import { z } from 'zod';

import { type JsonObject, JsonObjectSchema } from './json-value';

/**
 * Converts a Zod schema to the JSON Schema sent as a response schema or tool parameters.
 * Drops the `$schema` dialect marker, which Gemini doesn't document as supported. Gemini accepts
 * a subset of JSON Schema and may ignore keywords such as `maxLength`, so the reply is always
 * re-validated with the same Zod schema.
 *
 * @example
 * toJsonSchema(z.object({ verdict: z.enum(['benign', 'malicious']) }));
 * // { type: 'object', properties: { verdict: { type: 'string', enum: [...] } }, required: [...], ... }
 */
export function toJsonSchema(schema: z.ZodType): JsonObject {
  const jsonSchema = JsonObjectSchema.parse(z.toJSONSchema(schema));
  return Object.fromEntries(Object.entries(jsonSchema).filter(([key]) => key !== '$schema'));
}
