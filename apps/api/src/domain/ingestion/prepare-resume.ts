import type { GuardSignal } from '../guard/guard-verdict';
import { scanInvisible } from '../guard/invisible';
import { scanRedactedText } from '../guard/scan';
import { extractHeaderName } from '../redaction/header-name';
import { redact, type RedactionResult } from '../redaction/redact';

/** A resume after the rule layers of ingestion, ready for the classifier and the policy. */
export interface PreparedResume {
  /** The `# Full Name` heading of the normalized text; `null` when there is none. */
  headerName: string | null;
  /** The redacted text and its summary. Every later step sees only this text. */
  redaction: RedactionResult;
  /** L0 signals (raw text), then L1 and L2 signals (redacted text), in that order. */
  signals: GuardSignal[];
}

/**
 * The deterministic half of ingestion (SPEC §9.5 steps 1–3, before the classifier):
 *
 * 1. L0 scan on the raw text, which also strips the invisible characters it records.
 * 2. NFKC normalization, so fullwidth or compatibility characters can't dodge the rules.
 * 3. Redaction, with the header name read from the normalized text.
 * 4. L1 hidden markup and L2 pattern rules on the redacted text.
 *
 * Stripping comes first, so a zero-width space can't split a name or an email and slip past
 * redaction.
 *
 * @example
 * const { redaction, signals } = prepareResume(markdown);
 * if (shouldRunClassifier(signals)) { … classify(redaction.text) … }
 */
export function prepareResume(raw: string): PreparedResume {
  const invisible = scanInvisible(raw);
  const normalized = invisible.stripped.normalize('NFKC');
  const headerName = extractHeaderName(normalized);
  const redaction = redact(normalized, { personName: headerName });
  return {
    headerName,
    redaction,
    signals: [...invisible.signals, ...scanRedactedText(redaction.text)],
  };
}
