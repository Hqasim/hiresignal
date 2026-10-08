import type { CandidateAlias, CandidateId } from '../../domain/candidates/candidate';
import type { ChunkRef } from '../../domain/candidates/chunk-ref';
import type { JobId } from '../../domain/jobs/job';
import type { RedactedText } from '../../domain/redaction/redacted-text';
import type { UnitVector } from '../../domain/vectors/unit-vector';

/** A stored chunk with what a prompt or a citation needs: its ref, owner and offsets. */
export interface RetrievedChunk {
  ref: ChunkRef;
  candidateId: CandidateId;
  alias: CandidateAlias;
  section: string;
  contextHeader: string;
  content: RedactedText;
  /** Offsets of `content` in the candidate's redacted resume, for highlighting. */
  startOffset: number;
  endOffset: number;
}

/** A hybrid-search hit. */
export interface ScoredChunk extends RetrievedChunk {
  /** Cosine similarity to the query embedding, in [-1, 1]; the ask use case's floor checks it. */
  similarity: number;
  /** Reciprocal-rank-fusion score across the vector and keyword arms; results are sorted by it. */
  rrfScore: number;
}

/** Parameters of {@link ChunkRepository.hybridSearch}. Tunables come from `config/ai.ts`. */
export interface HybridSearchQuery {
  jobId: JobId;
  /** Restricts the search to one candidate (the screening agent); `null` searches the whole job. */
  candidateId: CandidateId | null;
  /** Embedding of the query (task type `RETRIEVAL_QUERY`). */
  queryVector: UnitVector;
  /** The query as typed; parsed with `websearch_to_tsquery`, so it is never SQL. */
  queryText: string;
  /** How many chunks each arm contributes before fusion (`RETRIEVAL_POOL_PER_ARM`). */
  poolPerArm: number;
  /** RRF damping constant (`RRF_K`). */
  rrfK: number;
  /** How many fused results to return. */
  limit: number;
}

/** Read access to resume chunks. Writing them belongs to `CandidateRepository.insertIngested`. */
export interface ChunkRepository {
  /**
   * Ranks the job's chunks by vector similarity and by full-text match, then fuses the two
   * rankings with RRF (SPEC §9.7). Quarantined candidates never appear. Ties are broken by
   * similarity, then by ref, so results are deterministic.
   */
  hybridSearch(query: HybridSearchQuery): Promise<ScoredChunk[]>;
  /** Every chunk of one section of one candidate, in resume order (the agent's `read_section`). */
  getSection(candidateId: CandidateId, section: string): Promise<RetrievedChunk[]>;
  /** The chunks behind `refs` within the job, ordered by ref. Unknown refs are simply absent. */
  getByRefs(jobId: JobId, refs: readonly ChunkRef[]): Promise<RetrievedChunk[]>;
}
