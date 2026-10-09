import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { redact } from './redact';
import { PiiTypeSchema } from './redaction-summary';

/** One labelled snippet of `data/evals/pii.jsonl` (SPEC §12). */
const PiiEvalItemSchema = z.object({
  id: z.string().regex(/^P\d{2}$/),
  text: z.string().min(1),
  personName: z.string().nullable(),
  entities: z.array(z.object({ type: PiiTypeSchema, value: z.string().min(1) })).min(1),
});

const items = readFileSync(new URL('../../../../../data/evals/pii.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((line) => PiiEvalItemSchema.parse(JSON.parse(line)));

describe('data/evals/pii.jsonl', () => {
  it('has 15 snippets with unique ids that cover every PII type', () => {
    expect(items).toHaveLength(15);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(new Set(items.flatMap((item) => item.entities.map((e) => e.type)))).toEqual(
      new Set(PiiTypeSchema.options),
    );
  });

  it.each(items.map((item) => [item.id, item] as const))(
    '%s labels only values that are in its text',
    (_id, item) => {
      for (const entity of item.entities) {
        expect(item.text, entity.value).toContain(entity.value);
      }
    },
  );

  // The PII eval gate (SPEC §14): zero leaked entities across the set.
  it.each(items.map((item) => [item.id, item] as const))(
    '%s leaks no labelled entity after redaction',
    (_id, item) => {
      const { text, summary } = redact(item.text, { personName: item.personName });

      for (const entity of item.entities) {
        expect(text, `${entity.type} leaked`).not.toContain(entity.value);
      }
      expect(summary.map((entry) => entry.type)).toEqual(
        expect.arrayContaining([...new Set(item.entities.map((entity) => entity.type))]),
      );
    },
  );
});
