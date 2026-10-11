import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readPiiSet } from '../../infrastructure/dataset/pii-set';
import { redact } from './redact';
import { PiiTypeSchema } from './redaction-summary';

const items = await readPiiSet(fileURLToPath(new URL('../../../../../data/', import.meta.url)));

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
