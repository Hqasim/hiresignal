import type {
  ChunkOutlineEntry,
  ChunkRepository,
  HybridSearchQuery,
  RetrievedChunk,
  ScoredChunk,
} from '../../src/application/ports/chunk-repository';
import type { Candidate, CandidateId } from '../../src/domain/candidates/candidate';
import { type ChunkRef, formatChunkRef } from '../../src/domain/candidates/chunk-ref';
import type { EmbeddedChunk } from '../../src/domain/chunks/resume-chunk';
import type { JobId } from '../../src/domain/jobs/job';
import { cosineSimilarity } from '../../src/domain/vectors/unit-vector';
import type { InMemoryCandidateRepository } from './in-memory-candidate-repository';

/**
 * {@link ChunkRepository} fake over the chunks an {@link InMemoryCandidateRepository} stored, so a
 * test ingests or inserts candidates once and reads them back here. Hybrid search is vector-only:
 * it ranks by cosine similarity (ties by ref) and reports `1 / (rrfK + rank)` as the fused score.
 * The keyword arm and its SQL are covered by the Postgres integration tests. Every search is
 * recorded, so tests can assert its scope.
 */
export class InMemoryChunkRepository implements ChunkRepository {
  readonly searches: HybridSearchQuery[] = [];

  constructor(private readonly candidates: InMemoryCandidateRepository) {}

  hybridSearch(query: HybridSearchQuery): Promise<ScoredChunk[]> {
    this.searches.push(query);
    const hits = this.eligible(query.jobId)
      .filter(({ candidate }) => query.candidateId === null || candidate.id === query.candidateId)
      .map(({ candidate, chunk }) => ({
        ...toRetrieved(candidate, chunk),
        similarity: cosineSimilarity(chunk.embedding, query.queryVector),
      }))
      .sort((a, b) => b.similarity - a.similarity || a.ref.localeCompare(b.ref))
      .slice(0, query.limit)
      .map((hit, rank) => ({ ...hit, rrfScore: 1 / (query.rrfK + rank + 1) }));
    return Promise.resolve(hits);
  }

  listOutline(candidateId: CandidateId): Promise<ChunkOutlineEntry[]> {
    return Promise.resolve(
      this.ofCandidate(candidateId).map(({ ref, section, contextHeader }) => ({
        ref,
        section,
        contextHeader,
      })),
    );
  }

  getSection(candidateId: CandidateId, section: string): Promise<RetrievedChunk[]> {
    return Promise.resolve(this.ofCandidate(candidateId).filter((c) => c.section === section));
  }

  getByRefs(jobId: JobId, refs: readonly ChunkRef[]): Promise<RetrievedChunk[]> {
    const wanted = new Set<string>(refs);
    return Promise.resolve(
      this.eligible(jobId)
        .map(({ candidate, chunk }) => toRetrieved(candidate, chunk))
        .filter((chunk) => wanted.has(chunk.ref))
        .sort((a, b) => a.ref.localeCompare(b.ref)),
    );
  }

  private ofCandidate(candidateId: CandidateId): RetrievedChunk[] {
    const candidate = this.candidates.candidates.find((c) => c.id === candidateId);
    if (candidate === undefined || candidate.guardStatus === 'quarantined') {
      return [];
    }
    return (this.candidates.chunks.get(candidateId) ?? [])
      .map((chunk) => toRetrieved(candidate, chunk))
      .sort((a, b) => a.startOffset - b.startOffset);
  }

  private eligible(jobId: JobId): { candidate: Candidate; chunk: EmbeddedChunk }[] {
    return this.candidates.candidates
      .filter((c) => c.jobId === jobId && c.guardStatus !== 'quarantined')
      .flatMap((candidate) =>
        (this.candidates.chunks.get(candidate.id) ?? []).map((chunk) => ({ candidate, chunk })),
      );
  }
}

function toRetrieved(candidate: Candidate, chunk: EmbeddedChunk): RetrievedChunk {
  return {
    ref: formatChunkRef(candidate.alias, chunk.ordinal),
    candidateId: candidate.id,
    alias: candidate.alias,
    section: chunk.section,
    contextHeader: chunk.contextHeader,
    content: chunk.content,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
  };
}
