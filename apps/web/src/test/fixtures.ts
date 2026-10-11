import type { CandidateSummary, JobDetail } from '@hiresignal/contracts';

/** Test data shaped like the seeded demo (SPEC §12), small enough to read in a test. */

export const JOB: JobDetail = {
  slug: 'senior-fullstack-ai',
  title: 'Senior Full-Stack Engineer, AI Platform',
  company: 'Northbeam Analytics',
  description:
    'Northbeam Analytics builds forecasting software.\n\nWe are hiring a Senior Full-Stack Engineer.\n\n## What you will do\n\n- Build things.',
  requirements: [
    {
      id: 'R1',
      text: '5+ years building production web applications with TypeScript and React',
      kind: 'must',
      weight: 3,
    },
    {
      id: 'R2',
      text: 'Designed and operated backend APIs and relational databases',
      kind: 'must',
      weight: 3,
    },
    { id: 'R5', text: 'AWS serverless experience', kind: 'nice', weight: 1 },
  ],
};

/** A stable, valid UUID for candidate `n`. */
export function candidateId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function summary(
  n: number,
  overrides: Partial<CandidateSummary> & Pick<CandidateSummary, 'score'>,
): CandidateSummary {
  return {
    id: candidateId(n),
    alias: `C${String(n).padStart(2, '0')}`,
    displayName: null,
    guardStatus: 'clean',
    shortlisted: false,
    mustHaves: overrides.score === null ? null : { met: 4, strong: 4, total: 4 },
    ...overrides,
  };
}

/** The ranked list as the API orders it: score descending, quarantined last. */
export const CANDIDATES: CandidateSummary[] = [
  summary(1, { score: 100 }),
  summary(2, { score: 100, displayName: 'Marcus Okafor', shortlisted: true }),
  summary(5, { score: 69, mustHaves: { met: 4, strong: 3, total: 4 } }),
  summary(3, { score: 50, mustHaves: { met: 4, strong: 0, total: 4 } }),
  summary(6, { score: null, guardStatus: 'quarantined' }),
  summary(7, { score: null, guardStatus: 'quarantined' }),
];
