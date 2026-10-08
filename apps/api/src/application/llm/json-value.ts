import { z } from 'zod';

/**
 * Any JSON-serializable value. Model turns, tool arguments and recorded fixtures are JSON, so
 * they can be hashed, stored and replayed byte for byte (SPEC §9.8).
 */
export const JsonValueSchema = z.json();
/** See {@link JsonValueSchema}. */
export type JsonValue = z.infer<typeof JsonValueSchema>;

/** A JSON object, such as tool arguments or a JSON Schema. */
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
/** See {@link JsonObjectSchema}. */
export type JsonObject = z.infer<typeof JsonObjectSchema>;
