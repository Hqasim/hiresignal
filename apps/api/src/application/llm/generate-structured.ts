import type { z } from 'zod';

import { LlmOutputInvalidError } from '../errors/llm-output-invalid-error';
import type { LlmClient, LlmRequest, LlmResponse, LlmResult } from '../ports/llm-client';
import { toJsonSchema } from './json-schema';

/** A generation whose reply must match `schema`. Tools aren't allowed: the reply is the answer. */
export interface StructuredRequest<T> extends Omit<LlmRequest, 'responseSchema' | 'tools'> {
  schema: z.ZodType<T>;
}

/** The parsed reply, plus every model response it took (one, or two after a repair). */
export interface StructuredResult<T> {
  value: T;
  responses: readonly LlmResult[];
}

type ParseOutcome<T> = { ok: true; value: T } | { ok: false; problems: readonly string[] };

/**
 * Generates a reply that must match a Zod schema (backend rules, "Structured output"):
 *
 * 1. Sends the schema as JSON Schema.
 * 2. Parses the reply with the same Zod schema.
 * 3. If it doesn't match, asks once more with the exact problems appended after the model's own
 *    reply, which stays unchanged in the history.
 * 4. If the second reply doesn't match either, throws.
 *
 * @throws LlmOutputInvalidError when both replies fail validation.
 *
 * @example
 * const { value } = await generateStructured(llm, {
 *   task: 'guard.classify', promptVersion: 'classifier@1', system, contents,
 *   maxOutputTokens: 512, schema: ClassifierVerdictSchema,
 * });
 */
export async function generateStructured<T>(
  llm: LlmClient,
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  const { schema, ...rest } = request;
  const base: LlmRequest = { ...rest, responseSchema: toJsonSchema(schema) };

  const first = await llm.generate(base);
  const firstOutcome = parseReply(schema, first);
  if (firstOutcome.ok) {
    return { value: firstOutcome.value, responses: [first] };
  }

  const second = await llm.generate({
    ...base,
    contents: [
      ...base.contents,
      { role: 'model', content: first.content },
      { role: 'user', text: repairInstruction(firstOutcome.problems) },
    ],
  });
  const secondOutcome = parseReply(schema, second);
  if (secondOutcome.ok) {
    return { value: secondOutcome.value, responses: [first, second] };
  }

  throw new LlmOutputInvalidError(
    `The model's ${request.task} reply didn't match its schema after one repair attempt.`,
  );
}

function parseReply<T>(schema: z.ZodType<T>, response: LlmResponse): ParseOutcome<T> {
  const truncated =
    response.finishReason === 'max_tokens'
      ? ['The reply was cut off at the output token limit. Answer more briefly.']
      : [];
  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch {
    return { ok: false, problems: [...truncated, 'The reply was not valid JSON.'] };
  }
  const result = schema.safeParse(json);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const issues = result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  return { ok: false, problems: [...truncated, ...issues] };
}

function repairInstruction(problems: readonly string[]): string {
  return [
    'Your previous reply did not match the required JSON schema:',
    ...problems.map((problem) => `- ${problem}`),
    'Reply again with JSON that matches the schema exactly.',
  ].join('\n');
}
