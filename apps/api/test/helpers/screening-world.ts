import type { LlmFunctionCall, LlmResponse } from '../../src/application/ports/llm-client';
import type { CandidateId } from '../../src/domain/candidates/candidate';
import type { Job } from '../../src/domain/jobs/job';
import { FakeEmbedder } from '../fakes/fake-embedder';
import { fakeLlmResponse } from '../fakes/fake-llm-client';
import { InMemoryCandidateRepository } from '../fakes/in-memory-candidate-repository';
import { InMemoryChunkRepository } from '../fakes/in-memory-chunk-repository';
import { InMemoryJobRepository } from '../fakes/in-memory-job-repository';
import { InMemoryScorecardRepository } from '../fakes/in-memory-scorecard-repository';
import { aCandidate, aNewJob, aQuarantinedCandidate } from './builders';

/** C04's chunk texts, in resume order (refs C04#0, C04#1, C04#2). */
export const C04_CHUNKS = {
  experience:
    '### Staff Engineer, Acme (2019–2024)\n\n- Built React and TypeScript dashboards\n  used by 40 teams.',
  skills: 'TypeScript, React, AWS Lambda, PostgreSQL',
  projects: '### Thumbnailer\n\n- Deployed an AWS Lambda function that resizes images.',
} as const;

/** Everything a screening test needs, in memory: a job, three candidates and the fakes. */
export interface ScreeningWorld {
  job: Job;
  jobs: InMemoryJobRepository;
  candidates: InMemoryCandidateRepository;
  chunks: InMemoryChunkRepository;
  scorecards: InMemoryScorecardRepository;
  embedder: FakeEmbedder;
  /** The candidate under screening, with three chunks. */
  c04: CandidateId;
  /** Another candidate of the job, whose chunks must never leak into C04's screening. */
  c01: CandidateId;
  /** A quarantined candidate: never screened. */
  c06: CandidateId;
}

/**
 * Builds the in-memory world the screening tests share. The job has requirements R1 (must,
 * weight 3) and R5 (nice, weight 1), from {@link aNewJob}.
 */
export async function aScreeningWorld(): Promise<ScreeningWorld> {
  const jobs = new InMemoryJobRepository();
  const job = await jobs.upsert(aNewJob());
  const candidates = new InMemoryCandidateRepository();
  const { id: c04 } = await candidates.insertIngested(
    aCandidate(job.id, 'C04', [
      { section: 'experience', text: C04_CHUNKS.experience, theta: 0 },
      { section: 'skills', text: C04_CHUNKS.skills, theta: 0.6 },
      { section: 'projects', text: C04_CHUNKS.projects, theta: 1.2 },
    ]),
  );
  const { id: c01 } = await candidates.insertIngested(
    aCandidate(job.id, 'C01', [
      { section: 'experience', text: 'Built React apps for a bank.', theta: 0 },
    ]),
  );
  const { id: c06 } = await candidates.insertIngested(aQuarantinedCandidate(job.id, 'C06'));
  return {
    job,
    jobs,
    candidates,
    chunks: new InMemoryChunkRepository(candidates),
    scorecards: new InMemoryScorecardRepository(),
    embedder: new FakeEmbedder(),
    c04,
    c01,
    c06,
  };
}

/**
 * A model turn that only calls functions, as the screening agent's turns do.
 *
 * @example
 * callsTurn([{ id: 'a', name: 'read_section', args: { section: 'skills' } }]);
 */
export function callsTurn(
  calls: readonly LlmFunctionCall[],
  overrides: Partial<LlmResponse> = {},
): LlmResponse {
  return fakeLlmResponse('', {
    functionCalls: calls,
    usage: { inputTokens: 5000, outputTokens: 40, cachedTokens: 4096 },
    ...overrides,
  });
}
