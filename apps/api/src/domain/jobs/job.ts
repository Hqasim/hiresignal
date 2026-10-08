import { z } from 'zod';

/** Database id of a job. */
export const JobIdSchema = z.uuid().brand<'JobId'>();
/** See {@link JobIdSchema}. */
export type JobId = z.infer<typeof JobIdSchema>;

/** URL-safe job identifier, for example `senior-fullstack-ai`; used in API paths. */
export const JobSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words joined by single hyphens')
  .brand<'JobSlug'>();
/** See {@link JobSlugSchema}. */
export type JobSlug = z.infer<typeof JobSlugSchema>;

/** Whether a requirement is a must-have (counted in `mustHavesMet`) or a nice-to-have. */
export const RequirementKindSchema = z.enum(['must', 'nice']);
/** See {@link RequirementKindSchema}. */
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

/** Requirement id within a job, for example `R1` (SPEC §12). */
export const RequirementIdSchema = z.string().regex(/^R\d+$/, 'Use R followed by a number');
/** See {@link RequirementIdSchema}. */
export type RequirementId = z.infer<typeof RequirementIdSchema>;

/**
 * One line of the job's rubric. `weight` is a positive integer; the score is the weighted mean
 * of rating values (SPEC §9.6).
 */
export const RequirementSchema = z.object({
  id: RequirementIdSchema,
  text: z.string().min(1),
  kind: RequirementKindSchema,
  weight: z.number().int().positive(),
});
/** See {@link RequirementSchema}. */
export type Requirement = z.infer<typeof RequirementSchema>;

/** A job's full rubric: at least one requirement, with unique ids. Stored as `jobs.requirements`. */
export const RequirementsSchema = z
  .array(RequirementSchema)
  .min(1)
  .refine((requirements) => new Set(requirements.map((r) => r.id)).size === requirements.length, {
    message: 'Requirement ids must be unique',
  });

/** A job opening and the rubric candidates are screened against. */
export interface Job {
  id: JobId;
  slug: JobSlug;
  title: string;
  company: string;
  description: string;
  requirements: Requirement[];
  createdAt: Date;
}
