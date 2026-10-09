import type {
  ChunkOutlineEntry,
  ChunkRepository,
  HybridSearchQuery,
  RetrievedChunk,
  ScoredChunk,
} from '../../application/ports/chunk-repository';
import type { CandidateId } from '../../domain/candidates/candidate';
import {
  type ChunkRef,
  parseChunkRef,
  type ParsedChunkRef,
} from '../../domain/candidates/chunk-ref';
import type { JobId } from '../../domain/jobs/job';
import type { Queryable } from './create-pool';
import {
  CHUNK_COLUMNS,
  ChunkOutlineRowSchema,
  ChunkRowSchema,
  ScoredChunkRowSchema,
  toChunkOutlineEntry,
  toRetrievedChunk,
  toScoredChunk,
} from './pg-chunk-rows';
import { queryRows } from './query-rows';
import { toVectorLiteral } from './vector-literal';

/**
 * Hybrid retrieval: the one place the similarity SQL lives (SPEC §9.7, ADR 0008).
 *
 * Two arms rank the eligible chunks independently:
 * - `vec`: nearest neighbours by cosine distance. `<=>` is `1 − cos(a, b)`, and the embeddings are
 *   unit vectors, so ordering by it ascending is ordering by similarity descending. HNSW serves
 *   it when the planner thinks that's cheaper than a scan.
 * - `kw`: full-text matches ranked by `ts_rank_cd` (cover density) over the generated
 *   `content_tsv`, which includes the context header. `$8` picks how the query text matches:
 *   - `all`: `websearch_to_tsquery`, which ANDs every word. Right for the screening agent's short
 *     phrases ("pgvector hybrid search").
 *   - `any`: ORs the query's lexemes (stemmed, stop words dropped by `to_tsvector`), so a natural
 *     question still matches: ANDed, "Which candidates know Go?" needs the stem `candid`, which no
 *     resume contains. Cover density still ranks a chunk with more of the words higher. Each
 *     lexeme is quoted with `quote_literal`, so query text is never parsed as tsquery syntax.
 *   - `off`: no keyword arm, so the search is vector-only (the retrieval ablation).
 *
 * Reciprocal rank fusion then scores each chunk `Σ 1 / (k + rank)` over the arms it appears in.
 * It uses ranks, not raw scores, so a cosine and a text rank need no calibration against each
 * other, and a chunk found by both arms beats one found by either alone. `k` damps the advantage
 * of the very top ranks.
 *
 * Both arms filter to the job and drop quarantined candidates (which have no chunks anyway; this
 * is defense in depth). Cosine similarity is returned for every fused row, including keyword-only
 * hits, so the ask use case can apply its similarity floor.
 *
 * Parameters: $1 query vector, $2 query text, $3 job, $4 candidate or null, $5 pool per arm,
 * $6 RRF k, $7 limit, $8 keyword match.
 */
const HYBRID_SEARCH_SQL = `
with
q   as (select $1::vector as v,
               case $8::text
                 when 'all' then websearch_to_tsquery('english', $2)
                 when 'any' then (select string_agg(quote_literal(lexeme), ' | ')::tsquery
                                  from unnest(tsvector_to_array(to_tsvector('english', $2))) lexeme)
                 else null
               end as tsq),
vec as (select c.id, row_number() over (order by c.embedding <=> q.v) as r
        from resume_chunks c join candidates k on k.id = c.candidate_id, q
        where k.job_id = $3 and k.guard_status <> 'quarantined'
          and ($4::uuid is null or c.candidate_id = $4)
        order by c.embedding <=> q.v limit $5),
kw  as (select c.id, row_number() over (order by ts_rank_cd(c.content_tsv, q.tsq) desc) as r
        from resume_chunks c join candidates k on k.id = c.candidate_id, q
        where k.job_id = $3 and k.guard_status <> 'quarantined'
          and ($4::uuid is null or c.candidate_id = $4)
          and c.content_tsv @@ q.tsq
        order by ts_rank_cd(c.content_tsv, q.tsq) desc limit $5),
fused as (select id, sum(1.0 / ($6 + r)) as rrf_score
          from (select * from vec union all select * from kw) arms
          group by id)
select ${CHUNK_COLUMNS},
       1 - (c.embedding <=> q.v) as similarity,
       f.rrf_score::float8 as rrf_score
from fused f
join resume_chunks c on c.id = f.id
join candidates k on k.id = c.candidate_id, q
order by f.rrf_score desc, similarity desc, k.alias, c.ordinal
limit $7`;

/**
 * {@link ChunkRepository} on Postgres + pgvector.
 *
 * @example
 * const chunks = createPgChunkRepository(pool);
 * const hits = await chunks.hybridSearch({ jobId, candidateId: null, queryVector, queryText, … });
 */
export function createPgChunkRepository(db: Queryable): ChunkRepository {
  return {
    async hybridSearch(query: HybridSearchQuery): Promise<ScoredChunk[]> {
      const rows = await queryRows(
        db,
        HYBRID_SEARCH_SQL,
        [
          toVectorLiteral(query.queryVector),
          query.queryText,
          query.jobId,
          query.candidateId,
          query.poolPerArm,
          query.rrfK,
          query.limit,
          query.keywordMatch,
        ],
        ScoredChunkRowSchema,
      );
      return rows.map(toScoredChunk);
    },

    async listOutline(candidateId: CandidateId): Promise<ChunkOutlineEntry[]> {
      const rows = await queryRows(
        db,
        `select k.alias, c.ordinal, c.section, c.context_header
         from resume_chunks c join candidates k on k.id = c.candidate_id
         where c.candidate_id = $1 and k.guard_status <> 'quarantined'
         order by c.ordinal`,
        [candidateId],
        ChunkOutlineRowSchema,
      );
      return rows.map(toChunkOutlineEntry);
    },

    async getSection(candidateId: CandidateId, section: string): Promise<RetrievedChunk[]> {
      const rows = await queryRows(
        db,
        `select ${CHUNK_COLUMNS}
         from resume_chunks c join candidates k on k.id = c.candidate_id
         where c.candidate_id = $1 and c.section = $2 and k.guard_status <> 'quarantined'
         order by c.ordinal`,
        [candidateId, section],
        ChunkRowSchema,
      );
      return rows.map(toRetrievedChunk);
    },

    async getByRefs(jobId: JobId, refs: readonly ChunkRef[]): Promise<RetrievedChunk[]> {
      const parsed = refs.map(parseChunkRef).filter((ref): ref is ParsedChunkRef => ref !== null);
      if (parsed.length === 0) {
        return [];
      }
      // The refs travel as two parallel arrays and are joined as a table.
      const rows = await queryRows(
        db,
        `select ${CHUNK_COLUMNS}
         from unnest($2::text[], $3::int[]) as r(alias, ordinal)
         join candidates k on k.alias = r.alias and k.job_id = $1
         join resume_chunks c on c.candidate_id = k.id and c.ordinal = r.ordinal
         where k.guard_status <> 'quarantined'
         order by k.alias, c.ordinal`,
        [jobId, parsed.map((ref) => ref.alias), parsed.map((ref) => ref.ordinal)],
        ChunkRowSchema,
      );
      return rows.map(toRetrievedChunk);
    },
  };
}
