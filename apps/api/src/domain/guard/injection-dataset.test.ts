import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { extractHeaderName } from '../redaction/header-name';
import { redact } from '../redaction/redact';
import type { GuardSignal } from './guard-verdict';
import { scanInvisible } from './invisible';
import { scanRedactedText } from './scan';

/** One item of `data/evals/injection.jsonl` (SPEC §12). */
const InjectionEvalItemSchema = z.object({
  id: z.string().regex(/^[MB]\d{2}$/),
  label: z.enum(['malicious', 'benign']),
  category: z.string().min(1),
  text: z.string().min(1),
});
type InjectionEvalItem = z.infer<typeof InjectionEvalItemSchema>;

const items = readFileSync(
  new URL('../../../../../data/evals/injection.jsonl', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n')
  .map((line) => InjectionEvalItemSchema.parse(JSON.parse(line)));

/** Paraphrased attacks with no tell-tale phrase: by design, only the L3 classifier can catch them. */
const CLASSIFIER_ONLY = new Set(['social-engineering']);
/** Categories the rules alone must quarantine, with no help from the classifier. */
const RULES_QUARANTINE = new Set(['hidden-markup', 'unicode-tag-smuggling']);

/** The rule layers of ingestion (SPEC §9.5 steps 1–3): L0 on raw text, then NFKC, redact, L1 and L2. */
function ruleSignals(raw: string): GuardSignal[] {
  const invisible = scanInvisible(raw);
  const normalized = invisible.stripped.normalize('NFKC');
  const { text } = redact(normalized, { personName: extractHeaderName(normalized) });
  return [...invisible.signals, ...scanRedactedText(text)];
}

function byLabel(label: InjectionEvalItem['label']): (readonly [string, InjectionEvalItem])[] {
  return items.filter((item) => item.label === label).map((item) => [item.id, item] as const);
}

describe('data/evals/injection.jsonl', () => {
  it('has 20 malicious and 20 benign items with unique ids', () => {
    expect(byLabel('malicious')).toHaveLength(20);
    expect(byLabel('benign')).toHaveLength(20);
    expect(new Set(items.map((item) => item.id)).size).toBe(40);
  });

  it.each(byLabel('malicious').filter(([, item]) => !CLASSIFIER_ONLY.has(item.category)))(
    '%s raises at least one rule signal',
    (_id, item) => {
      expect(ruleSignals(item.text)).not.toEqual([]);
    },
  );

  it.each(byLabel('malicious').filter(([, item]) => RULES_QUARANTINE.has(item.category)))(
    '%s is quarantined by the rules alone (a high signal)',
    (_id, item) => {
      expect(ruleSignals(item.text).map((signal) => signal.severity)).toContain('high');
    },
  );

  it.each(byLabel('benign'))('%s raises no high-severity signal', (_id, item) => {
    expect(ruleSignals(item.text).filter((signal) => signal.severity === 'high')).toEqual([]);
  });
});
