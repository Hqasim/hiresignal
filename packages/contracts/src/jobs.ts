import { z } from 'zod';

/** URL-safe job identifier in paths, for example `senior-fullstack-ai`. */
export const JobSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Path parameters of `/api/jobs/:slug…`. */
export const JobSlugParamsSchema = z.object({ slug: JobSlugSchema });

/** One line of a job's rubric. */
export const RequirementSchema = z.object({
  id: z.string().regex(/^R\d+$/),
  text: z.string().min(1),
  kind: z.enum(['must', 'nice']),
  weight: z.int().positive(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

/** A job in the list (`GET /api/jobs`). */
export const JobSummarySchema = z.object({
  slug: JobSlugSchema,
  title: z.string().min(1),
  company: z.string().min(1),
  requirementCount: z.int().nonnegative(),
});
export type JobSummary = z.infer<typeof JobSummarySchema>;

/** Response of `GET /api/jobs`. */
export const JobListResponseSchema = z.object({ jobs: z.array(JobSummarySchema) });
export type JobListResponse = z.infer<typeof JobListResponseSchema>;

/** Response of `GET /api/jobs/:slug`: the job and its rubric. */
export const JobDetailSchema = z.object({
  slug: JobSlugSchema,
  title: z.string().min(1),
  company: z.string().min(1),
  description: z.string(),
  requirements: z.array(RequirementSchema),
});
export type JobDetail = z.infer<typeof JobDetailSchema>;
