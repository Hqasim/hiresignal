import { z } from 'zod';

import { TextSpanSchema } from '../shared/text-span';

/**
 * Which rule layer raised a signal: L0 invisible characters, L1 hidden markup, L2 pattern rules
 * (SPEC §9.4). The L3 classifier returns a {@link ClassifierVerdict} instead.
 */
export const GuardLayerSchema = z.enum(['L0', 'L1', 'L2']);
/** See {@link GuardLayerSchema}. */
export type GuardLayer = z.infer<typeof GuardLayerSchema>;

/** How serious a rule signal is. Any `high` signal quarantines the resume. */
export const SignalSeveritySchema = z.enum(['medium', 'high']);
/** See {@link SignalSeveritySchema}. */
export type SignalSeverity = z.infer<typeof SignalSeveritySchema>;

/** One rule hit, with where it is in the redacted resume (when it has a location). */
export const GuardSignalSchema = z.object({
  /** Stable rule id, for example `L2.instruction-override`. */
  id: z.string().min(1),
  layer: GuardLayerSchema,
  severity: SignalSeveritySchema,
  /** Short description shown to the recruiter. */
  label: z.string().min(1),
  /** Location in the redacted resume; `null` for whole-document signals such as stripped characters. */
  span: TextSpanSchema.nullable(),
  /** A short piece of the offending (redacted) text, so a person can judge the signal. */
  excerpt: z.string(),
});
/** See {@link GuardSignalSchema}. */
export type GuardSignal = z.infer<typeof GuardSignalSchema>;

/** The L3 classifier's structured judgment. */
export const ClassifierVerdictSchema = z.object({
  verdict: z.enum(['benign', 'suspicious', 'malicious']),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});
/** See {@link ClassifierVerdictSchema}. */
export type ClassifierVerdict = z.infer<typeof ClassifierVerdictSchema>;

/**
 * Everything the guard found, stored as `candidates.guard_verdict`. `dismissed` holds medium
 * signals the classifier judged benign, kept for transparency. `classifier` is `null` when the
 * classifier didn't run.
 */
export const GuardVerdictSchema = z.object({
  signals: z.array(GuardSignalSchema),
  classifier: ClassifierVerdictSchema.nullable(),
  dismissed: z.array(GuardSignalSchema),
});
/** See {@link GuardVerdictSchema}. */
export type GuardVerdict = z.infer<typeof GuardVerdictSchema>;
