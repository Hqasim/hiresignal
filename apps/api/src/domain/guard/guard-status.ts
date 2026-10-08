import { z } from 'zod';

/**
 * Outcome of the injection guard (SPEC §9.4).
 * - `clean`: screened normally.
 * - `flagged`: screened, but marked for a person to look at.
 * - `quarantined`: never chunked, embedded, retrieved or scored.
 */
export const GuardStatusSchema = z.enum(['clean', 'flagged', 'quarantined']);
/** See {@link GuardStatusSchema}. */
export type GuardStatus = z.infer<typeof GuardStatusSchema>;
