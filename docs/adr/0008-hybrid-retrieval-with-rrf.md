# 0008. Hybrid retrieval with RRF

- **Status:** Accepted
- **Date:** 2026-10-10

## Context

Two features retrieve resume chunks:

- **The screening agent** (Phase 5) runs `search_resume` within one candidate, with short phrases it writes itself ("pgvector hybrid search").
- **Ask the talent pool** (Phase 6) runs across a whole job, with a recruiter's natural-language question ("Which candidates have shipped tool calling to production?").

Neither kind of query is served well by one method alone:

- **Embeddings** find paraphrases ("LLM orchestration" for "shipped LLM features"), but can rank a vaguely related chunk above an exact term match.
- **Full-text search** finds exact terms ("Step Functions", "recall@5", "Spring Boot") and names of tools, but misses paraphrases.

The result also has to say how close the best match is, so ask can refuse a question nothing in the pool answers without spending a model call (SPEC §9.7 step 3). And the search must never return a quarantined candidate (SPEC §9.4).

The data is small: 53 chunks from 8 clean candidates of one job, in Postgres with pgvector ([ADR 0005](0005-neon-postgres-pgvector-only-datastore.md)).

## Decision

**One SQL statement does both searches and fuses them with reciprocal rank fusion** (`HYBRID_SEARCH_SQL` in [`pg-chunk-repository.ts`](../../apps/api/src/infrastructure/postgres/pg-chunk-repository.ts), the only similarity SQL in the codebase):

- **`vec` arm:** the job's chunks ordered by cosine distance (`<=>`) to the query embedding, top `RETRIEVAL_POOL_PER_ARM` (20). The embeddings are unit vectors ([ADR 0007](0007-embedding-model-dimensions-and-normalization.md)).
- **`kw` arm:** chunks whose `content_tsv` (context header plus content, English stemming) matches the query, ranked by `ts_rank_cd` (cover density), top 20.
- **Fusion:** each chunk scores `Σ 1 / (RRF_K + rank)` over the arms that found it, with `RRF_K` = 60 (Cormack et al., 2009). Ranks need no calibration between a cosine and a text rank, and a chunk both arms found beats one only one arm found. Ties are broken by similarity, then alias and ordinal, so results are deterministic.
- **Cosine similarity is returned for every fused row,** keyword-only hits included, so ask can apply `SIMILARITY_FLOOR` to the best one.
- **Both arms break ties by alias, then chunk ordinal.** `any` matching often gives several chunks the same `ts_rank_cd`. Without a tie-break, `row_number()` numbers them in physical row order, which differs between a fresh database and one re-seeded with `--reset`. The first ask recording (2026-10-10) was made on a re-seeded database, so none of its 20 answers replayed on a fresh one: Q01's 5th and 6th chunks had swapped, which changed the prompt and so the fixture key. An integration test now rewrites rows to reverse their stored order and checks the results don't move.
- **Both arms filter** to the job and to candidates that aren't quarantined. Quarantined resumes have no chunks anyway; the filter is defense in depth.

**The keyword arm's match mode is a parameter** (`KeywordMatch` on [`HybridSearchQuery`](../../apps/api/src/application/ports/chunk-repository.ts)):

- **`all`** uses `websearch_to_tsquery`, which ANDs every word. The screening agent keeps it: its phrases are short and every word matters. Its tool results, and with them every screening fixture key, are unchanged.
- **`any`** ORs the query's lexemes (`to_tsvector`, then each lexeme quoted with `quote_literal` and joined with `|`). Ask uses it (`ASK_KEYWORD_MATCH`). ANDed, a natural question finds nothing: "Which candidates know Go?" needs the stem `candid` in the same chunk as `go`, and no resume says "candidates". Cover density still ranks a chunk that matches more of the words higher.
- **`off`** drops the keyword arm, for the vector-only ablation.

**`SIMILARITY_FLOOR` = 0.65, tuned on the golden questions.** Below it, ask answers "insufficient evidence" without calling a model. Above it, the model may still set its own `insufficientEvidence` flag, and an answer with no verified citation is withheld (SPEC §9.7).

### Measurements (as of 2026-10-10)

The golden set is 20 answerable questions and 3 out-of-scope ones ([`data/evals/retrieval.jsonl`](../../data/evals/retrieval.jsonl)). The numbers come from `npm run ask:golden`, which replays the `gemini-embedding-2` query embeddings Hamzah recorded on 2026-10-10 (23 live calls). recall@5 is the share of expected candidates found among the candidates of the top 5 chunks (SPEC §14).

| Keyword match | recall@5 | MRR   |
| ------------- | -------- | ----- |
| `all`         | 0.983    | 1.000 |
| `any` (ask)   | 1.000    | 0.950 |
| `off`         | 0.958    | 0.938 |

- **Vector-only misses two expected candidates.** In Q14 (JSON Schema and a repair step) it misses C01, and in Q19 (open-source libraries) it misses C04. `any` brings both into the top 5, because their chunks contain the exact terms.
- **`all` matched anything on only 3 of the 20 questions** (Q10, Q14, Q15). On the other 17 its results were identical to vector-only, which shows the AND problem directly. Where it did match, every word matched, a precise signal, so its MRR is 1.000. But it still misses C04 in Q19.
- **`any` was chosen for its recall,** because recall@5 is what ask's answer depends on: the model sees only the retrieved chunks, and a missing candidate can't be cited. Its lower MRR comes from two questions, Q10 and Q14, whose first expected chunk ranks second.
- **The set is close to saturated.** With 8 candidates, a top 5 of chunks often covers most of the pool. Phase 9's eval runner keeps these numbers as a regression gate, and harder questions should be added before any of them is read as a quality claim.

**Where the floor sits:**

- The lowest best similarity of an answerable question was 0.661 (Q14 and Q15).
- The highest of an out-of-scope question was 0.639 (X02, "Who has worked as a pastry chef?"). X01 scored 0.585 and X03 0.607.
- 0.65 splits all 23 correctly, but the margin is only 0.022 on each side. `gemini-embedding-2` similarities between a question and any resume chunk sit in a narrow band (0.58–0.79 here), so the floor can only stop clear misses. The model's insufficient flag and citation verification carry the rest.

**Routing.** The same run measured what ask's routing policy would see ([ADR 0010](0010-rule-based-routing-with-tier-fallback.md)):

- The context was 911–2,037 estimated tokens per question, so the 3,000-token rule never fires.
- The 12 chunks spanned 4–7 candidates. At the spec's `ASK_ESCALATION_CANDIDATES` = 3, every question went to Flash, so Hamzah raised it to 6 (2026-10-10). Flash-Lite now answers 15 of the 20. Flash answers the three comparative questions (Q02, Q19, and Q10, whose "reciprocal **rank** fusion" matches the comparative pattern by accident, harmlessly) and Q11 and Q12, whose chunks span 7 candidates.

### `EXPLAIN` on the seeded data

`EXPLAIN (ANALYZE)` of the full statement for Q07, with `any` matching, on the local seeded database (Postgres 18, pgvector 0.8):

- **Default settings:** the vector arm is a sequential scan of `resume_chunks` (53 rows), sorted by distance. The keyword arm also scans and filters. Execution took 1.2 ms.
- **With `enable_seqscan = off`:** the keyword arm switches to the `resume_chunks_tsv_gin` bitmap index (44 matching lexeme hits, 22 rows). The vector arm still doesn't use `resume_chunks_embedding_hnsw`: it reaches the job's chunks through the candidates index and sorts all 53 by distance. Execution took 0.7 ms.

That is an **exact** nearest-neighbour search, which is right at this size: it is deterministic, has perfect recall, and costs about a millisecond.

The HNSW index can't serve this arm as written, for two reasons:

- The query vector comes from the `q` CTE, not a parameter, so the `ORDER BY` isn't `column <=> constant`.
- The job filter is a join that runs before the ordering.

**At scale** (tens of thousands of chunks), the arm would change in three ways:

- order by `c.embedding <=> $1::vector` directly, so pgvector can use the index
- set `hnsw.iterative_scan = relaxed_order` (pgvector 0.8), so a filtered index scan keeps fetching candidates until `LIMIT` rows pass the job and quarantine filters, instead of returning too few
- denormalize `job_id` onto `resume_chunks`, or partition by job, so the filter needn't join

Approximate search could then reorder near-ties. That would change the screening agent's tool results, so it would need a re-recording of the screening fixtures.

## Consequences

- **Positive:**
  - One round trip returns fused, deterministic results with the similarity the floor needs.
  - The ablation is the same SQL with a different parameter, so Phase 9's eval suite can report vector-only against hybrid without a second code path.
  - The screening agent's retrieval is byte-identical to Phase 5, and the seed integration test proves it on every run.
  - Query text never becomes SQL or tsquery syntax: `websearch_to_tsquery` and quoted lexemes treat it as words. An integration test sends quotes, operators and stop words only.
- **Negative:**
  - The floor's margin is 0.022 on 23 questions. A new kind of question could land on the wrong side, so the floor is a cost guard, not a relevance judgment.
  - `any` lets common words match. Stop words are dropped, but words like "built" or "experience" still add weak keyword hits. RRF damps them, because a keyword-only hit ranks below a chunk both arms found.
  - The exact scan grows linearly with the pool. That's fine for the demo; the changes above are needed before it isn't.
  - `RRF_K` and `RETRIEVAL_POOL_PER_ARM` are the textbook values, not tuned: the golden set is too saturated to tell them apart.

## Alternatives considered

- **Vector search only.** Rejected: it scored lower on both metrics (recall@5 0.958, MRR 0.938), and it misses exact tool names, which recruiters search for.
- **A weighted sum of cosine similarity and `ts_rank_cd`.** Rejected: the two scores have different scales and distributions, so the weight would need tuning per query type and would drift whenever the embedding model changes. RRF needs only ranks.
- **AND matching (`websearch_to_tsquery`) for ask too.** Rejected: natural questions rarely have every word in one chunk, so the keyword arm returned nothing for 17 of the 20 golden questions. It measured recall@5 0.983 against 1.000 for `any`.
- **An LLM reranker or query rewriting.** Rejected for now: it adds a model call to every question on a free-tier quota, and the measured recall leaves nothing to gain on this set.
- **A dedicated vector database (Pinecone, Qdrant).** Rejected in [ADR 0005](0005-neon-postgres-pgvector-only-datastore.md): Postgres does both arms and the filters in one statement, at $0.
