import type { CandidateAlias, CandidateId } from '../../domain/candidates/candidate';
import { chunkResume, toEmbeddingInput } from '../../domain/chunking/chunk-resume';
import type { EmbeddedChunk, ResumeChunk } from '../../domain/chunks/resume-chunk';
import type { GuardStatus } from '../../domain/guard/guard-status';
import type { ClassifierVerdict, GuardVerdict } from '../../domain/guard/guard-verdict';
import {
  decideGuard,
  type GuardDecision,
  type GuardThresholds,
  shouldRunClassifier,
} from '../../domain/guard/policy';
import { prepareResume } from '../../domain/ingestion/prepare-resume';
import type { JobId } from '../../domain/jobs/job';
import type { ClassifyInjection } from '../guard/classify-injection';
import { LlmCallError } from '../llm/llm-call-error';
import type { CandidateRepository } from '../ports/candidate-repository';
import type { Embedder } from '../ports/embedder';
import type { ResumeSource } from './resume-source';

/** Dependencies of {@link createIngestResume}. Tunables arrive from `main/`. */
export interface IngestResumeDeps {
  /** The L3 classifier (`createClassifyInjection`). */
  classify: ClassifyInjection;
  embedder: Embedder;
  candidates: CandidateRepository;
  /** `CLASSIFIER_QUARANTINE_CONFIDENCE`. */
  thresholds: GuardThresholds;
  /** `CHUNK_MAX_TOKENS`. */
  chunkMaxTokens: number;
}

/** One resume to ingest into a job. */
export interface IngestResumeInput {
  jobId: JobId;
  source: ResumeSource;
}

/** What ingestion decided for one resume: metadata only, never resume text. */
export interface IngestOutcome {
  alias: CandidateAlias;
  candidateId: CandidateId;
  /** `false` when this source was already ingested: nothing ran and nothing was written. */
  created: boolean;
  guardStatus: GuardStatus;
  /** Ids of the signals that count against the resume, for example `L1.html-comment`. */
  signalIds: string[];
  /** Ids of medium signals the classifier judged benign. */
  dismissedIds: string[];
  /** The L3 verdict; `null` when a high signal made it unnecessary. */
  classifier: ClassifierVerdict | null;
  /** Chunks stored; `null` when the candidate was already ingested and nothing was counted. */
  chunkCount: number | null;
}

/** Ingests one resume. */
export type IngestResume = (input: IngestResumeInput) => Promise<IngestOutcome>;

/**
 * The ingestion pipeline (SPEC §9.5, §6.3):
 *
 * 1. Skip the resume if this job already has its source hash, so re-seeding calls no model.
 * 2. L0 scan, NFKC, redaction, L1 and L2 (`prepareResume`).
 * 3. The L3 classifier, only if no high signal already quarantines the resume (ADR 0013).
 * 4. The quarantine policy.
 * 5. Quarantined: store the redacted text and verdict, and stop. It is never chunked, embedded,
 *    retrieved or scored.
 * 6. Otherwise: chunk by section and role, embed every chunk in one `embedDocuments` call, and
 *    store the candidate and its chunks in one transaction.
 *
 * Only `RedactedText` reaches the classifier and the embedder. The header name becomes the
 * synthetic `displayName`, revealed only on shortlisting; without a header, the alias stands in.
 *
 * @throws LlmCallError if the embedder returns the wrong number of vectors.
 * @throws whatever the classifier, embedder or repository throw (see their ports).
 *
 * @example
 * const ingest = createIngestResume({ classify, embedder, candidates, thresholds, chunkMaxTokens });
 * const outcome = await ingest({ jobId: job.id, source });
 */
export function createIngestResume(deps: IngestResumeDeps): IngestResume {
  return async ({ jobId, source }) => {
    const existing = await deps.candidates.findBySourceHash(jobId, source.sourceHash);
    if (existing !== null) {
      return {
        ...verdictSummary(existing.guardVerdict),
        alias: existing.alias,
        candidateId: existing.id,
        created: false,
        guardStatus: existing.guardStatus,
        chunkCount: null,
      };
    }

    const { headerName, redaction, signals } = prepareResume(source.text);
    const classifier = shouldRunClassifier(signals) ? await deps.classify(redaction.text) : null;
    const decision = decideGuard({ signals, classifier }, deps.thresholds);
    const fields = {
      jobId,
      alias: source.alias,
      displayName: headerName ?? source.alias,
      sourceHash: source.sourceHash,
      redactedResume: redaction.text,
      redactionSummary: redaction.summary,
      guardVerdict: decision.verdict,
    };

    const chunks = await embedUnlessQuarantined(deps, decision, () =>
      chunkResume(redaction.text, { alias: source.alias, maxTokens: deps.chunkMaxTokens }),
    );
    const { id, created } =
      decision.status === 'quarantined'
        ? await deps.candidates.insertIngested({
            ...fields,
            guardStatus: 'quarantined',
            chunks: [],
          })
        : await deps.candidates.insertIngested({ ...fields, guardStatus: decision.status, chunks });
    return {
      ...verdictSummary(decision.verdict),
      alias: source.alias,
      candidateId: id,
      created,
      guardStatus: decision.status,
      chunkCount: chunks.length,
    };
  };
}

async function embedUnlessQuarantined(
  deps: IngestResumeDeps,
  decision: GuardDecision,
  chunk: () => ResumeChunk[],
): Promise<EmbeddedChunk[]> {
  if (decision.status === 'quarantined') {
    return [];
  }
  const chunks = chunk();
  if (chunks.length === 0) {
    return [];
  }
  const vectors = await deps.embedder.embedDocuments(chunks.map(toEmbeddingInput));
  const mismatch = () =>
    new LlmCallError(
      `The embedder returned ${String(vectors.length)} vectors for ${String(chunks.length)} chunks`,
      { reason: 'rejected', task: 'embed.documents' },
    );
  if (vectors.length !== chunks.length) {
    throw mismatch();
  }
  return chunks.map((chunk, index) => {
    const embedding = vectors[index];
    if (embedding === undefined) {
      throw mismatch();
    }
    return { ...chunk, embedding };
  });
}

function verdictSummary(
  verdict: GuardVerdict,
): Pick<IngestOutcome, 'signalIds' | 'dismissedIds' | 'classifier'> {
  return {
    signalIds: verdict.signals.map((signal) => signal.id),
    dismissedIds: verdict.dismissed.map((signal) => signal.id),
    classifier: verdict.classifier,
  };
}
